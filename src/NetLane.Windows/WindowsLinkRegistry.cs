using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using NetLane.Abstractions;

namespace NetLane.Windows;

/// <summary>
/// Descoberta de links pela BCL, sem P/Invoke.
///
/// <see cref="NetworkInterface.Id"/> no Windows **é** o <c>InterfaceGuid</c>, que
/// é exatamente a identidade que D-003 exige — então esta parte não precisa de
/// interop nenhum. O P/Invoke só entra quando for preciso *escrever* na tabela de
/// rotas, e aí ele vive em Interop/ e Routing/.
/// </summary>
public sealed class WindowsLinkRegistry : ILinkRegistry
{
    /// <summary>
    /// Rampa de identidade do design.md §4. A cor no NetLane não é marca: é qual
    /// link é qual. Atribuída por ordem estável de GUID para o mesmo link receber
    /// sempre a mesma cor entre execuções — cor que dança não identifica nada.
    /// </summary>
    private static readonly string[] Ramp =
    [
        "raia-1", "raia-2", "raia-3", "raia-4", "raia-5", "raia-6",
    ];

    public IReadOnlyList<Link> Snapshot()
    {
        var links = new List<Link>();

        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (!IsRealLink(nic, out var properties))
            {
                continue;
            }

            var addresses = new List<IPAddress>();
            foreach (var unicast in properties!.UnicastAddresses)
            {
                addresses.Add(unicast.Address);
            }

            var gateways = new List<GatewayInfo>();
            foreach (var gateway in properties.GatewayAddresses)
            {
                // O Windows lista 0.0.0.0 como gateway em adaptadores que não têm
                // um de verdade. Tratar isso como gateway faria um link sem saída
                // parecer Ready, que é precisamente o erro que D-011 evita.
                if (IPAddress.Any.Equals(gateway.Address) || IPAddress.IPv6Any.Equals(gateway.Address))
                {
                    continue;
                }

                gateways.Add(new GatewayInfo(gateway.Address, gateway.Address.AddressFamily));
            }

            links.Add(new Link(
                new LinkId(nic.Id),
                nic.Name,
                DetermineState(nic, gateways, addresses),
                gateways,
                addresses));
        }

        // Ordem estável por GUID, e só então a cor. Ordenar pelo nome faria a cor
        // de um link mudar quando outro é renomeado.
        links.Sort((a, b) => string.CompareOrdinal(a.Id.Value, b.Id.Value));

        for (var i = 0; i < links.Count; i++)
        {
            links[i] = links[i] with { ColorToken = Ramp[i % Ramp.Length] };
        }

        return links;
    }

    /// <summary>
    /// Separa link de pseudo-adaptador.
    ///
    /// Esta máquina expõe 47 interfaces, das quais cerca de 40 são camadas de
    /// filtro (WFP, QoS Packet Scheduler, Native WiFi Filter) e túneis inativos.
    /// Mostrar as 47 seria entregar a pergunta ao usuário em vez de responder.
    ///
    /// O discriminador **não** é o nome: os nomes são localizados (esta máquina
    /// está em pt-BR) e casar "Filter" quebraria em qualquer outro idioma. O
    /// discriminador é estrutural — uma camada de filtro não tem configuração
    /// IPv4 nem IPv6, e <c>GetIPv4Properties()</c> lança nela.
    /// </summary>
    private static bool IsRealLink(NetworkInterface nic, out IPInterfaceProperties? properties)
    {
        properties = null;

        if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
        {
            return false;
        }

        // NotPresent é hardware ausente: o tethering desconectado, o Bluetooth
        // sem par. Não é um link fora do ar, é um link que não existe agora.
        if (nic.OperationalStatus == OperationalStatus.NotPresent)
        {
            return false;
        }

        try
        {
            var props = nic.GetIPProperties();

            // A chamada que separa: em camada de filtro ela lança.
            _ = props.GetIPv4Properties();

            properties = props;
            return true;
        }
        catch (NetworkInformationException)
        {
            return false;
        }
        catch (PlatformNotSupportedException)
        {
            return false;
        }
    }

    private static LinkState DetermineState(
        NetworkInterface nic,
        IReadOnlyList<GatewayInfo> gateways,
        IReadOnlyList<IPAddress> addresses)
    {
        if (nic.OperationalStatus != OperationalStatus.Up)
        {
            return LinkState.Down;
        }

        if (gateways.Count > 0)
        {
            return LinkState.Ready;
        }

        // APIPA (169.254/16) e link-local IPv6: o adaptador subiu e não achou
        // DHCP. Nesta máquina é o enlace ponto a ponto do streaming e o Tailscale.
        // Distinguir de NoGateway importa para a interface: "sem gateway" soa
        // como defeito, "só rede local" descreve um link que está fazendo
        // exatamente o que deveria.
        var onlyLinkLocal = addresses.Count > 0;
        foreach (var address in addresses)
        {
            var isLinkLocal =
                (address.AddressFamily == AddressFamily.InterNetworkV6 && address.IsIPv6LinkLocal) ||
                (address.AddressFamily == AddressFamily.InterNetwork && IsIPv4LinkLocal(address));

            if (!isLinkLocal)
            {
                onlyLinkLocal = false;
                break;
            }
        }

        return onlyLinkLocal ? LinkState.LocalOnly : LinkState.NoGateway;
    }

    private static bool IsIPv4LinkLocal(IPAddress address)
    {
        var octets = address.GetAddressBytes();
        return octets.Length == 4 && octets[0] == 169 && octets[1] == 254;
    }
}
