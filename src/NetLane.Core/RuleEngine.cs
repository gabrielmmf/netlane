using NetLane.Abstractions;

namespace NetLane.Core;

/// <summary>
/// Decide qual link um processo deve usar. Puro: recebe regras e links, devolve
/// uma decisão. Sem I/O, sem Windows — é o que torna esta parte testável num
/// runner de CI que não tem placa de rede.
/// </summary>
public sealed class RuleEngine
{
    private readonly IReadOnlyList<ProcessRule> rules;

    public RuleEngine(IReadOnlyList<ProcessRule> rules) => this.rules = rules;

    /// <summary>
    /// A regra que casa com este executável, ou <c>null</c>.
    ///
    /// Comparação sem caminho e sem extensão, ignorando maiúsculas: o mesmo jogo
    /// instalado em outro drive continua sendo o mesmo jogo (D-001).
    /// </summary>
    public ProcessRule? MatchFor(string executablePath)
    {
        var name = NormalizeExecutableName(executablePath);
        if (name.Length == 0)
        {
            return null;
        }

        foreach (var rule in rules)
        {
            if (rule.Enabled &&
                string.Equals(NormalizeExecutableName(rule.ExecutableName), name, StringComparison.OrdinalIgnoreCase))
            {
                return rule;
            }
        }

        return null;
    }

    /// <summary>
    /// O link por onde este processo deve sair, ou <c>null</c> para "deixe o
    /// Windows decidir".
    ///
    /// Devolve null também quando a regra existe mas aponta para um link que não
    /// está pronto. É deliberado, e é o D-011: mandar tráfego por um link sem
    /// gateway não é um redirecionamento pior, é perda de conectividade. Sair do
    /// caminho e deixar a rota padrão valer é o comportamento correto.
    /// </summary>
    public LinkDecision Decide(string executablePath, IReadOnlyList<Link> links)
    {
        var rule = MatchFor(executablePath);
        if (rule is null)
        {
            return LinkDecision.NoRule();
        }

        Link? target = null;
        foreach (var link in links)
        {
            if (link.Id == rule.LinkId)
            {
                target = link;
                break;
            }
        }

        if (target is null)
        {
            return LinkDecision.LinkMissing(rule);
        }

        return target.CanCarryTraffic
            ? LinkDecision.Route(rule, target)
            : LinkDecision.LinkNotReady(rule, target);
    }

    /// <summary>Nome do executável, sem caminho e sem extensão.</summary>
    public static string NormalizeExecutableName(string executablePath)
    {
        if (string.IsNullOrWhiteSpace(executablePath))
        {
            return string.Empty;
        }

        var trimmed = executablePath.Trim();

        // Separador dos dois tipos: o arquivo de regras pode ter sido escrito à
        // mão, e uma barra de estilo errado não é motivo para a regra não casar.
        var lastSlash = trimmed.LastIndexOfAny(['\\', '/']);
        if (lastSlash >= 0)
        {
            trimmed = trimmed[(lastSlash + 1)..];
        }

        if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[..^4];
        }

        return trimmed;
    }
}

/// <summary>O que fazer com um processo, e por quê — a interface mostra o porquê.</summary>
public sealed record LinkDecision(
    LinkDecisionKind Kind,
    ProcessRule? Rule = null,
    Link? Link = null)
{
    public static LinkDecision NoRule() => new(LinkDecisionKind.NoRule);

    public static LinkDecision Route(ProcessRule rule, Link link) =>
        new(LinkDecisionKind.Route, rule, link);

    public static LinkDecision LinkMissing(ProcessRule rule) =>
        new(LinkDecisionKind.LinkMissing, rule);

    public static LinkDecision LinkNotReady(ProcessRule rule, Link link) =>
        new(LinkDecisionKind.LinkNotReady, rule, link);

    /// <summary>Texto para a interface. Português, como todo texto de tela.</summary>
    public string Explanation => Kind switch
    {
        LinkDecisionKind.Route => $"Sai por {Link!.DisplayName}.",
        LinkDecisionKind.NoRule => "Sem regra: o Windows escolhe.",
        LinkDecisionKind.LinkMissing =>
            $"A regra aponta para um link que não está presente agora. " +
            $"Enquanto ele não voltar, o Windows escolhe.",
        LinkDecisionKind.LinkNotReady =>
            $"{Link!.DisplayName} está {Descrever(Link.State)} e não pode receber rota. " +
            $"O Windows escolhe.",
        _ => string.Empty,
    };

    private static string Descrever(LinkState state) => state switch
    {
        LinkState.Ready => "pronto",
        LinkState.NoGateway => "sem gateway",
        LinkState.LocalOnly => "só em rede local",
        LinkState.Down => "fora do ar",
        _ => "em estado desconhecido",
    };
}

public enum LinkDecisionKind
{
    NoRule,
    Route,
    LinkMissing,
    LinkNotReady,
}
