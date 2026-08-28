using System.Text.RegularExpressions;
using Xunit;

namespace NetLane.Architecture.Tests;

/// <summary>
/// Os artigos de docs/constituicao.md que dao para provar por leitura do codigo.
///
/// Cada teste falha com a lista exata de arquivo:linha. Um artigo que so existe
/// em prosa e um artigo que alguem racionaliza as 2h da manha; aqui ele quebra
/// o build.
/// </summary>
public class ArtigosDaConstituicao
{
    /// <summary>
    /// Artigo 1: nunca tocar no processo.
    ///
    /// Estas APIs sao a definicao de "tocar no processo". Nenhuma tem uso
    /// legitimo no NetLane: o produto decide por onde o trafego sai mexendo na
    /// tabela de rotas, e nunca chega perto da memoria do jogo. Uma delas no
    /// codigo nao gera erro de compilacao. Gera ban de EasyAntiCheat, BattlEye,
    /// Vanguard ou EA AntiCheat, e ban nao tem reversao.
    /// </summary>
    [Fact]
    public void Artigo1_NaoExisteSinalDeInjecaoOuLeituraDeProcesso()
    {
        string[] proibidas =
        [
            "WriteProcessMemory", "ReadProcessMemory", "CreateRemoteThread",
            "VirtualAllocEx", "VirtualProtectEx", "SetWindowsHookEx",
            "QueueUserAPC", "NtMapViewOfSection", "SuspendThread",
            "DetourAttach", "WSAIoctl",
        ];

        var padrao = new Regex(
            @"\b(" + string.Join("|", proibidas) + @")\b",
            RegexOptions.Compiled);

        var achados = RepositorioEmDisco.Ocorrencias(padrao);

        Assert.True(
            achados.Count == 0,
            "Artigo 1 da constituicao: nunca tocar no processo. Encontrado:\n  " +
            string.Join("\n  ", achados) +
            "\n\nSe isto e mesmo necessario, o caminho e uma emenda a constituicao, " +
            "nao uma excecao neste teste.");
    }

    /// <summary>
    /// Artigo 3: nada do que o NetLane cria sobrevive a um reboot.
    ///
    /// Rota persistente entra em PersistentStore ou vem de "route -p". As duas
    /// tiram do usuario a ultima rede de seguranca dele, que e reiniciar a
    /// maquina e ter a rede de volta.
    /// </summary>
    [Fact]
    public void Artigo3_NaoExisteRotaPersistente()
    {
        var padrao = new Regex(
            @"PersistentStore|NET_LUID_PERSISTENT|route(\.exe)?\s+(add|change)[^""\n]*\s-p\b",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        var achados = RepositorioEmDisco.Ocorrencias(padrao);

        Assert.True(
            achados.Count == 0,
            "Artigo 3 da constituicao: rotas do NetLane vivem em ActiveStore e somem no " +
            "reboot. Encontrado:\n  " + string.Join("\n  ", achados));
    }

    /// <summary>
    /// Artigo 3 e D-004: alteracao de sistema so pela API, nunca por processo externo.
    ///
    /// netsh e route.exe fazem alteracao de sistema sem passar pelo registro do
    /// Artigo 2, respondem em texto localizado (esta maquina esta em pt-BR) e
    /// nao dao erro estruturado.
    /// </summary>
    [Fact]
    public void Artigo3_NaoChamaNetshNemRouteExe()
    {
        var padrao = new Regex(
            @"""[^""\n]*\b(netsh|route\.exe)\b[^""\n]*""",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        var achados = RepositorioEmDisco.Ocorrencias(padrao);

        Assert.True(
            achados.Count == 0,
            "Artigo 3 / D-004: a tabela de rotas se mexe pela IP Helper API, nao por " +
            "processo externo. Encontrado:\n  " + string.Join("\n  ", achados));
    }

    /// <summary>
    /// Artigo 4: nenhum valor desta maquina entra no codigo.
    ///
    /// Um ifIndex literal funciona hoje e quebra no proximo reconectar do
    /// tethering (D-003). Um IP literal transforma o produto num script de
    /// configuracao pessoal (D-001).
    ///
    /// Se um dia um literal legitimo aparecer (um endereco de teste de
    /// conectividade, por exemplo), o caminho e adiciona-lo a lista de
    /// permitidos abaixo, com o motivo. Nao afrouxar o padrao.
    /// </summary>
    [Fact]
    public void Artigo4_NaoExisteEnderecoOuIndiceLiteralNoCodigo()
    {
        string[] permitidos =
        [
            "0.0.0.0",          // rota default e bind em qualquer interface
            "255.255.255.255",  // broadcast
            "127.0.0.1",        // loopback
        ];

        var ipv4EmLiteral = new Regex(@"""(\d{1,3}(?:\.\d{1,3}){3})""", RegexOptions.Compiled);
        var indiceLiteral = new Regex(
            @"\b(ifIndex|IfIndex|InterfaceIndex)\s*=\s*\d+",
            RegexOptions.Compiled);

        var achados = new List<string>();

        foreach (var arquivo in RepositorioEmDisco.FontesDoProduto())
        {
            foreach (Match m in ipv4EmLiteral.Matches(arquivo.Conteudo))
            {
                if (permitidos.Contains(m.Groups[1].Value))
                {
                    continue;
                }

                var linha = RepositorioEmDisco.Linha(arquivo.Conteudo, m.Index);
                achados.Add($"{arquivo.Caminho}:{linha}  endereco literal {m.Value}");
            }
        }

        achados.AddRange(RepositorioEmDisco.Ocorrencias(indiceLiteral));

        Assert.True(
            achados.Count == 0,
            "Artigo 4 da constituicao: nenhum valor desta maquina no codigo. Encontrado:\n  " +
            string.Join("\n  ", achados) +
            "\n\nEnderecos e indices vem da tabela de interfaces em runtime.");
    }

    /// <summary>
    /// Regra de dependencia de plano-tecnico.md secao 2: todo o P/Invoke vive em
    /// NetLane.Windows e so la.
    ///
    /// E isto que torna a decisao de rota testavel sem Windows. Um DllImport que
    /// escapa para o Core faz o nucleo parar de ser puro, e o teste de decisao
    /// de rota passa a exigir a maquina real, que e exatamente o que nao se pode
    /// ter num runner de CI.
    /// </summary>
    [Fact]
    public void PInvokeSoExisteEmNetLaneWindows()
    {
        var padrao = new Regex(@"\[\s*(DllImport|LibraryImport)", RegexOptions.Compiled);

        var achados = RepositorioEmDisco.Ocorrencias(
            padrao,
            apenasEm: a => !a.Caminho.StartsWith("src/NetLane.Windows/", StringComparison.Ordinal));

        Assert.True(
            achados.Count == 0,
            "P/Invoke fora de src/NetLane.Windows/. Encontrado:\n  " +
            string.Join("\n  ", achados) +
            "\n\nMova a declaracao para NetLane.Windows e exponha um contrato de " +
            "NetLane.Abstractions no lugar.");
    }
}
