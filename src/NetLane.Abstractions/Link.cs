using System.Net;
using System.Net.Sockets;

namespace NetLane.Abstractions;

/// <summary>
/// Identidade estável de um link, ancorada no <c>InterfaceGuid</c> do Windows.
///
/// Nunca <c>ifIndex</c> e nunca MAC (D-003). Não é teoria: entre a captura do
/// baseline e a primeira execução deste código, nesta mesma máquina, o ifIndex
/// do Wi-Fi foi de 12 para 13 e o do Tailscale de 9 para 36, sem nada ter sido
/// reinstalado. O GUID não se moveu.
/// </summary>
public readonly record struct LinkId(string Value)
{
    public override string ToString() => Value;
}

/// <summary>
/// O estado de um link do ponto de vista de "dá para mandar tráfego por aqui?".
///
/// Link sem saída é estado de primeira classe, não erro (D-011). Nesta máquina
/// isso não é hipótese: há um Ethernet de 1 Gbps com cabo conectado, sem DHCP,
/// que é um enlace ponto a ponto para streaming — mandar tráfego de internet
/// por ele quebraria as duas coisas.
/// </summary>
public enum LinkState
{
    /// <summary>Ativo e com gateway. É o único estado que pode receber rota.</summary>
    Ready,

    /// <summary>Ativo, com endereço, mas sem gateway. Existe; não é saída.</summary>
    NoGateway,

    /// <summary>Só endereço de link-local (APIPA). Enlace ponto a ponto, não internet.</summary>
    LocalOnly,

    /// <summary>Presente e fora do ar.</summary>
    Down,
}

/// <summary>Um gateway, por família de endereço.</summary>
/// <param name="Address">O endereço do próximo salto.</param>
/// <param name="Family">
/// A família. Guardada explicitamente porque a pilha inteira é dual-family desde
/// o dia 1 (D-005): IPv6 é preferido sobre IPv4 (RFC 6724), então um caminho que
/// assume IPv4 deixa vazar todo destino com registro AAAA.
/// </param>
public sealed record GatewayInfo(IPAddress Address, AddressFamily Family);

/// <summary>
/// Um caminho de saída. Não é "adaptador": um adaptador sem gateway não é um
/// link utilizável, e esta máquina tem quatro deles.
/// </summary>
public sealed record Link(
    LinkId Id,
    string AdapterName,
    LinkState State,
    IReadOnlyList<GatewayInfo> Gateways,
    IReadOnlyList<IPAddress> Addresses)
{
    /// <summary>Nome dado pelo usuário ("Link de jogos"), ou o do sistema se não houver.</summary>
    public string DisplayName { get; init; } = AdapterName;

    /// <summary>
    /// Token de cor da rampa de identidade (design.md §4). É o identificador
    /// visual do link — no NetLane a cor não é marca, é qual link é qual.
    /// </summary>
    public string ColorToken { get; init; } = "raia-1";

    /// <summary>Só um link pronto pode receber rota (D-011).</summary>
    public bool CanCarryTraffic => State == LinkState.Ready;
}

/// <summary>A fronteira com o SO para descoberta de links. Mockável.</summary>
public interface ILinkRegistry
{
    /// <summary>
    /// Os links da máquina, agora. Sempre relido: nada é cacheado entre
    /// chamadas, porque índice e estado mudam sob os pés (D-003).
    /// </summary>
    IReadOnlyList<Link> Snapshot();
}
