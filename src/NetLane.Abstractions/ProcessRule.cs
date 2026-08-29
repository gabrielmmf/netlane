namespace NetLane.Abstractions;

/// <summary>
/// "Este executável sai por este link."
///
/// A regra casa o **executável do jogo**, não o launcher (D-006). A árvore de
/// processos serve para descobrir o jogo que nasceu sob o Steam; redirecionar o
/// Steam inteiro mandaria dezenas de GB de update pelo link errado — que, nesta
/// máquina, é uma franquia móvel.
/// </summary>
/// <param name="ExecutableName">
/// Nome do executável, sem caminho e sem extensão, comparado sem diferenciar
/// maiúsculas. Sem caminho de propósito: o mesmo jogo instalado em outro drive
/// continua sendo o mesmo jogo, e um caminho literal seria valor desta máquina
/// no arquivo de regras (D-001).
/// </param>
/// <param name="LinkId">O link de saída escolhido.</param>
/// <param name="InheritToChildren">
/// Se os filhos deste processo herdam a regra. **Opt-in por regra**, nunca o
/// padrão (D-006).
/// </param>
/// <param name="Enabled">Desligar sem apagar, para testar sem perder a regra.</param>
public sealed record ProcessRule(
    string ExecutableName,
    LinkId LinkId,
    bool InheritToChildren = false,
    bool Enabled = true);

/// <summary>Onde as regras vivem entre execuções.</summary>
public interface IRuleStore
{
    IReadOnlyList<ProcessRule> Load();

    void Save(IReadOnlyList<ProcessRule> rules);

    /// <summary>Caminho do arquivo, para a interface poder mostrar de onde veio.</summary>
    string Location { get; }
}
