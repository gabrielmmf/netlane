using System.Net;
using System.Net.Sockets;
using NetLane.Abstractions;
using NetLane.Core;
using Xunit;

namespace NetLane.Core.Tests;

/// <summary>
/// Decisão de link, sem tocar no SO. Se algum destes precisar de uma placa de
/// rede para rodar, a lógica vazou para NetLane.Windows e isso é o defeito.
/// </summary>
public class RuleEngineTests
{
    private static Link Link(string id, LinkState state, string name = "Link") =>
        new(
            new LinkId(id),
            name,
            state,
            state == LinkState.Ready
                ? [new GatewayInfo(IPAddress.Parse("198.51.100.1"), AddressFamily.InterNetwork)]
                : [],
            [IPAddress.Parse("198.51.100.50")])
        {
            DisplayName = name,
        };

    [Fact]
    public void RegraCasaOExecutavelIgnorandoCaminhoExtensaoECaixa()
    {
        var engine = new RuleEngine([new ProcessRule("Jogo", new LinkId("{A}"))]);

        Assert.NotNull(engine.MatchFor("jogo"));
        Assert.NotNull(engine.MatchFor("JOGO.exe"));
        Assert.NotNull(engine.MatchFor(@"D:\Games\Pasta\Jogo.exe"));
        Assert.NotNull(engine.MatchFor("/mnt/d/Games/Jogo.exe"));
    }

    [Fact]
    public void OMesmoJogoEmOutroDriveContinuaSendoOMesmoJogo()
    {
        // D-001: caminho literal no arquivo de regras seria valor desta máquina.
        var engine = new RuleEngine([new ProcessRule(@"C:\Antigo\Jogo.exe", new LinkId("{A}"))]);

        Assert.NotNull(engine.MatchFor(@"E:\Steam\steamapps\common\Jogo\Jogo.exe"));
    }

    [Fact]
    public void RegraDesligadaNaoCasa()
    {
        var engine = new RuleEngine([new ProcessRule("Jogo", new LinkId("{A}"), Enabled: false)]);

        Assert.Null(engine.MatchFor("Jogo"));
    }

    [Fact]
    public void SemRegraODecisorNaoInventaLink()
    {
        var engine = new RuleEngine([]);

        var decision = engine.Decide("Jogo", [Link("{A}", LinkState.Ready)]);

        Assert.Equal(LinkDecisionKind.NoRule, decision.Kind);
        Assert.Null(decision.Link);
    }

    [Fact]
    public void RegraParaLinkProntoRoteia()
    {
        var engine = new RuleEngine([new ProcessRule("Jogo", new LinkId("{A}"))]);

        var decision = engine.Decide("Jogo", [Link("{A}", LinkState.Ready, "Link de jogos")]);

        Assert.Equal(LinkDecisionKind.Route, decision.Kind);
        Assert.Equal("Link de jogos", decision.Link!.DisplayName);
    }

    /// <summary>
    /// D-011: link sem gateway nunca recebe rota. Nesta máquina isso protege o
    /// enlace ponto a ponto do streaming — mandar tráfego de internet por ele
    /// quebraria as duas coisas.
    /// </summary>
    [Theory]
    [InlineData(LinkState.NoGateway)]
    [InlineData(LinkState.LocalOnly)]
    [InlineData(LinkState.Down)]
    public void LinkQueNaoEstaProntoNuncaRecebeRota(LinkState state)
    {
        var engine = new RuleEngine([new ProcessRule("Jogo", new LinkId("{A}"))]);

        var decision = engine.Decide("Jogo", [Link("{A}", state)]);

        Assert.Equal(LinkDecisionKind.LinkNotReady, decision.Kind);
        Assert.Contains("o Windows escolhe", decision.Explanation, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// O tethering desconectado some da lista inteira, não vira um link "Down".
    /// A regra continua existindo e simplesmente não tem alvo — que é diferente
    /// de a regra ter sumido.
    /// </summary>
    [Fact]
    public void RegraApontandoParaLinkAusenteNaoQuebraENemRoteia()
    {
        var engine = new RuleEngine([new ProcessRule("Jogo", new LinkId("{ausente}"))]);

        var decision = engine.Decide("Jogo", [Link("{A}", LinkState.Ready)]);

        Assert.Equal(LinkDecisionKind.LinkMissing, decision.Kind);
        Assert.NotNull(decision.Rule);
        Assert.Null(decision.Link);
    }

    [Fact]
    public void SemNenhumLinkNadaRoteia()
    {
        // D-001: N links, incluindo 0. Não é caso de erro.
        var engine = new RuleEngine([new ProcessRule("Jogo", new LinkId("{A}"))]);

        var decision = engine.Decide("Jogo", []);

        Assert.Equal(LinkDecisionKind.LinkMissing, decision.Kind);
    }

    [Fact]
    public void NomeVazioNaoCasaComNada()
    {
        var engine = new RuleEngine([new ProcessRule("", new LinkId("{A}"))]);

        Assert.Null(engine.MatchFor(""));
        Assert.Null(engine.MatchFor("   "));
    }
}
