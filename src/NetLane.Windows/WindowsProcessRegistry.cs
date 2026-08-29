using System.Diagnostics;
using NetLane.Abstractions;

namespace NetLane.Windows;

/// <summary>Um processo em execução, do ponto de vista de "isto pode ganhar uma regra?".</summary>
/// <param name="Pid">O identificador do processo agora. Volátil por natureza.</param>
/// <param name="ExecutableName">Nome do executável sem extensão. É o que a regra casa.</param>
/// <param name="DisplayName">Título da janela, quando há; senão o nome do executável.</param>
/// <param name="HasWindow">Se tem janela principal — o sinal barato de "é um aplicativo".</param>
public sealed record RunningProcess(
    int Pid,
    string ExecutableName,
    string DisplayName,
    bool HasWindow);

/// <summary>
/// Lista os processos candidatos a receber uma regra.
///
/// Não usa a tabela de sockets. Saber *quais* processos estão de fato usando a
/// rede exige <c>GetExtendedTcpTable</c>, que é P/Invoke e entra numa fatia
/// própria — esta versão responde "a que executável eu quero dar uma regra?",
/// que é uma pergunta que não precisa do socket.
/// </summary>
public sealed class WindowsProcessRegistry
{
    public IReadOnlyList<RunningProcess> Snapshot()
    {
        var byExecutable = new Dictionary<string, RunningProcess>(StringComparer.OrdinalIgnoreCase);

        foreach (var process in Process.GetProcesses())
        {
            try
            {
                var name = process.ProcessName;
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                // Um jogo abre vários processos com o mesmo executável, e a regra
                // casa o executável, não o pid (D-006). Agrupar aqui evita uma
                // lista com o mesmo nome oito vezes, que é ruído puro.
                var hasWindow = HasMainWindow(process);
                var title = hasWindow ? SafeWindowTitle(process) : string.Empty;

                if (byExecutable.TryGetValue(name, out var existing))
                {
                    // Fica o que tem janela: é o que o usuário reconhece.
                    if (existing.HasWindow || !hasWindow)
                    {
                        continue;
                    }
                }

                byExecutable[name] = new RunningProcess(
                    process.Id,
                    name,
                    string.IsNullOrWhiteSpace(title) ? name : title,
                    hasWindow);
            }
            catch (InvalidOperationException)
            {
                // O processo morreu entre o GetProcesses e a leitura. É o caso
                // normal numa lista de processos, não uma condição de erro.
            }
            catch (Exception ex) when (ex is System.ComponentModel.Win32Exception)
            {
                // Processo de outro contexto de segurança (SYSTEM, sessão 0). Sem
                // elevação não dá para ler, e a UI não eleva — por decisão.
            }
            finally
            {
                process.Dispose();
            }
        }

        var result = byExecutable.Values.ToList();

        // Com janela primeiro: é onde o usuário vai procurar o jogo dele.
        result.Sort((a, b) =>
        {
            if (a.HasWindow != b.HasWindow)
            {
                return a.HasWindow ? -1 : 1;
            }

            return string.Compare(a.DisplayName, b.DisplayName, StringComparison.CurrentCultureIgnoreCase);
        });

        return result;
    }

    private static bool HasMainWindow(Process process)
    {
        try
        {
            return process.MainWindowHandle != IntPtr.Zero;
        }
        catch
        {
            return false;
        }
    }

    private static string SafeWindowTitle(Process process)
    {
        try
        {
            return process.MainWindowTitle;
        }
        catch
        {
            return string.Empty;
        }
    }
}
