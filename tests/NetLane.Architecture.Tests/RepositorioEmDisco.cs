using System.Text.RegularExpressions;

namespace NetLane.Architecture.Tests;

/// <summary>
/// Acesso aos arquivos-fonte do repositorio.
///
/// Os testes deste projeto nao compilam o produto: eles leem o codigo como
/// texto. E de proposito. Os artigos que estes testes protegem (nao injetar em
/// processo, nao criar rota persistente, nao embutir valor desta maquina) sao
/// violados por uma linha que compila perfeitamente. So a leitura pega.
/// </summary>
internal static class RepositorioEmDisco
{
    /// <summary>Raiz do repositorio, achada subindo ate encontrar .architect.json.</summary>
    public static string Raiz { get; } = AcharRaiz();

    private static string AcharRaiz()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, ".architect.json")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new InvalidOperationException(
            "Nao achei a raiz do repositorio (.architect.json) subindo de " +
            AppContext.BaseDirectory + ".");
    }

    /// <summary>
    /// Todo arquivo .cs e .xaml sob src/.
    ///
    /// Nao varre tests/ de proposito: o proprio arquivo de teste cita os nomes
    /// das APIs proibidas, e um teste que se acusa e um teste que alguem
    /// desliga na primeira semana.
    ///
    /// Nao varre obj/ nem bin/: o SDK gera la um AssemblyInfo.cs com strings de
    /// versao no formato "1.0.0.0", que a checagem do Artigo 4 leria como
    /// endereco IPv4 literal.
    /// </summary>
    public static IEnumerable<ArquivoFonte> FontesDoProduto()
    {
        var src = Path.Combine(Raiz, "src");
        if (!Directory.Exists(src))
        {
            yield break;
        }

        foreach (var caminho in Directory.EnumerateFiles(src, "*.*", SearchOption.AllDirectories))
        {
            var extensao = Path.GetExtension(caminho);
            if (extensao is not (".cs" or ".xaml"))
            {
                continue;
            }

            var relativo = Path.GetRelativePath(Raiz, caminho).Replace(Path.DirectorySeparatorChar, '/');
            if (relativo.Contains("/obj/", StringComparison.Ordinal) ||
                relativo.Contains("/bin/", StringComparison.Ordinal))
            {
                continue;
            }

            yield return new ArquivoFonte(relativo, File.ReadAllText(caminho));
        }
    }

    /// <summary>Toda ocorrencia de <paramref name="padrao"/> nas fontes do produto.</summary>
    public static List<string> Ocorrencias(Regex padrao, Func<ArquivoFonte, bool>? apenasEm = null)
    {
        var achados = new List<string>();

        foreach (var arquivo in FontesDoProduto())
        {
            if (apenasEm is not null && !apenasEm(arquivo))
            {
                continue;
            }

            foreach (Match m in padrao.Matches(arquivo.Conteudo))
            {
                achados.Add($"{arquivo.Caminho}:{Linha(arquivo.Conteudo, m.Index)}  {m.Value.Trim()}");
            }
        }

        return achados;
    }

    /// <summary>Numero da linha (base 1) de uma posicao no texto.</summary>
    public static int Linha(string conteudo, int indice)
    {
        var linha = 1;
        for (var i = 0; i < indice && i < conteudo.Length; i++)
        {
            if (conteudo[i] == '\n')
            {
                linha++;
            }
        }

        return linha;
    }
}

internal readonly record struct ArquivoFonte(string Caminho, string Conteudo);
