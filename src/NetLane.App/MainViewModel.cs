using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using NetLane.Abstractions;
using NetLane.Core;
using NetLane.Windows;

namespace NetLane.App;

/// <summary>
/// O estado da tela Início. Sem regra de negócio: a decisão é do
/// <see cref="RuleEngine"/>, aqui só se mostra e se edita.
/// </summary>
public sealed class MainViewModel : INotifyPropertyChanged
{
    private readonly ILinkRegistry linkRegistry;
    private readonly WindowsProcessRegistry processRegistry;
    private readonly IRuleStore ruleStore;

    private List<ProcessRule> rules;
    private string filter = string.Empty;
    private IReadOnlyList<RunningProcess> allProcesses = [];

    public MainViewModel(
        ILinkRegistry linkRegistry,
        WindowsProcessRegistry processRegistry,
        IRuleStore ruleStore)
    {
        this.linkRegistry = linkRegistry;
        this.processRegistry = processRegistry;
        this.ruleStore = ruleStore;
        this.rules = [.. ruleStore.Load()];

        Refresh();
    }

    public ObservableCollection<LinkColumn> Links { get; } = [];

    public ObservableCollection<ProcessRow> Processes { get; } = [];

    public string RuleFileLocation => ruleStore.Location;

    /// <summary>
    /// Filtro por nome. Sem ele a lista tem centenas de linhas e o jogo que o
    /// usuário quer está perdido no meio delas.
    /// </summary>
    public string Filter
    {
        get => filter;
        set
        {
            if (filter == value)
            {
                return;
            }

            filter = value;
            OnPropertyChanged();
            ApplyFilter();
        }
    }

    /// <summary>
    /// A frase de estado no rodapé. Diz a verdade inteira, inclusive a parte
    /// desconfortável: nesta versão nenhuma rota é criada.
    /// </summary>
    public string StatusLine
    {
        get
        {
            var ready = Links.Count(l => l.State == LinkState.Ready);
            var withRule = Processes.Count(p => p.Rule is not null);

            var links = ready switch
            {
                0 => "Nenhum link com saída para a internet agora",
                1 => "1 link com saída",
                _ => $"{ready} links com saída",
            };

            return $"{links} · {withRule} processo(s) com regra · " +
                   "nenhuma rota é criada nesta versão (o motor depende do F1)";
        }
    }

    /// <summary>
    /// Os links que não viram coluna, contados. D-011 diz que só `Ready` e
    /// `NoGateway` entram no Início — mas esconder quatro adaptadores sem dizer
    /// nada faria a tela mentir por omissão.
    /// </summary>
    public string HiddenLinksNote { get; private set; } = string.Empty;

    public void Refresh()
    {
        var links = linkRegistry.Snapshot();
        allProcesses = processRegistry.Snapshot();

        Links.Clear();
        var hidden = 0;

        foreach (var link in links)
        {
            // D-011: só Ready e NoGateway viram coluna. Um enlace ponto a ponto
            // e um túnel de VPN não são caminhos de saída, e mostrá-los como
            // colunas convidaria a atribuí-los.
            if (link.State is LinkState.Ready or LinkState.NoGateway)
            {
                Links.Add(new LinkColumn(link));
            }
            else
            {
                hidden++;
            }
        }

        HiddenLinksNote = hidden switch
        {
            0 => string.Empty,
            1 => "+1 adaptador sem saída (só rede local ou fora do ar), fora da lista",
            _ => $"+{hidden} adaptadores sem saída (só rede local ou fora do ar), fora da lista",
        };

        ApplyFilter();
        OnPropertyChanged(nameof(HiddenLinksNote));
        OnPropertyChanged(nameof(StatusLine));
    }

    /// <summary>Atribui (ou tira) o link de um executável, e persiste na hora.</summary>
    public void Assign(ProcessRow row, LinkColumn? link)
    {
        rules.RemoveAll(r => string.Equals(
            RuleEngine.NormalizeExecutableName(r.ExecutableName),
            RuleEngine.NormalizeExecutableName(row.ExecutableName),
            StringComparison.OrdinalIgnoreCase));

        if (link is not null)
        {
            rules.Add(new ProcessRule(row.ExecutableName, link.Id));
        }

        // Grava imediatamente. Uma tela de configuração com botão "salvar" é uma
        // tela onde alguém perde o trabalho ao fechar a janela.
        ruleStore.Save(rules);
        ApplyFilter();
        OnPropertyChanged(nameof(StatusLine));
    }

    private void ApplyFilter()
    {
        var engine = new RuleEngine(rules);
        var links = linkRegistry.Snapshot();
        var needle = filter.Trim();

        Processes.Clear();
        foreach (var process in allProcesses)
        {
            if (needle.Length > 0 &&
                process.DisplayName.IndexOf(needle, StringComparison.CurrentCultureIgnoreCase) < 0 &&
                process.ExecutableName.IndexOf(needle, StringComparison.CurrentCultureIgnoreCase) < 0)
            {
                continue;
            }

            var decision = engine.Decide(process.ExecutableName, links);
            Processes.Add(new ProcessRow(process, decision));
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>
/// Uma coluna-raia. Coluna e não card, de propósito: a pergunta que o usuário faz
/// a esta interface é *por onde?*, e posição responde antes da leitura (D-010).
/// </summary>
public sealed class LinkColumn
{
    public LinkColumn(Link link)
    {
        Id = link.Id;
        DisplayName = link.DisplayName;
        AdapterName = link.AdapterName;
        State = link.State;

        Gateway = link.Gateways.Count > 0
            ? string.Join("  ", link.Gateways.Select(g => g.Address.ToString()))
            : "—";

        Address = link.Addresses.Count > 0
            ? string.Join("  ", link.Addresses
                .Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                .Select(a => a.ToString()))
            : "—";

        if (string.IsNullOrEmpty(Address))
        {
            Address = "—";
        }

        ColorToken = link.ColorToken;
    }

    public LinkId Id { get; }

    public string DisplayName { get; }

    public string AdapterName { get; }

    public LinkState State { get; }

    public string Gateway { get; }

    public string Address { get; }

    public string ColorToken { get; }

    /// <summary>Texto de estado, em português e sem jargão de rede.</summary>
    public string StateLabel => State switch
    {
        LinkState.Ready => "com saída",
        LinkState.NoGateway => "sem gateway",
        LinkState.LocalOnly => "só rede local",
        LinkState.Down => "fora do ar",
        _ => "?",
    };

    /// <summary>Só link pronto pode ser alvo de regra (D-011).</summary>
    public bool CanBeAssigned => State == LinkState.Ready;

    public double DimWhenNotReady => CanBeAssigned ? 1.0 : 0.45;
}

/// <summary>Uma linha da lista de processos.</summary>
public sealed class ProcessRow
{
    public ProcessRow(RunningProcess process, LinkDecision decision)
    {
        Pid = process.Pid;
        ExecutableName = process.ExecutableName;
        DisplayName = process.DisplayName;
        HasWindow = process.HasWindow;
        Rule = decision.Rule;
        Explanation = decision.Explanation;
        AssignedLinkName = decision.Link?.DisplayName ?? "—";
        AssignedColorToken = decision.Link?.ColorToken ?? "Fumo";
    }

    public int Pid { get; }

    public string ExecutableName { get; }

    public string DisplayName { get; }

    public bool HasWindow { get; }

    public ProcessRule? Rule { get; }

    public string Explanation { get; }

    public string AssignedLinkName { get; }

    public string AssignedColorToken { get; }
}
