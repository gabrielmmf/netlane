using NetLane.Abstractions;
using NetLane.Core;
using Xunit;

namespace NetLane.Core.Tests;

public class JsonRuleStoreTests : IDisposable
{
    private readonly string pasta = Path.Combine(
        Path.GetTempPath(), "netlane-testes", Guid.NewGuid().ToString("N"));

    private string Arquivo => Path.Combine(pasta, "regras.json");

    [Fact]
    public void ArquivoInexistenteNaoEErro()
    {
        // Primeira execução do aplicativo. Zero regras é um estado normal.
        Assert.Empty(new JsonRuleStore(Arquivo).Load());
    }

    [Fact]
    public void GravaELeDeVolta()
    {
        var store = new JsonRuleStore(Arquivo);
        var regras = new[]
        {
            new ProcessRule("Jogo", new LinkId("{A}")),
            new ProcessRule("Outro", new LinkId("{B}"), InheritToChildren: true, Enabled: false),
        };

        store.Save(regras);
        var lidas = new JsonRuleStore(Arquivo).Load();

        Assert.Equal(2, lidas.Count);
        Assert.Equal("Jogo", lidas[0].ExecutableName);
        Assert.Equal(new LinkId("{A}"), lidas[0].LinkId);
        Assert.False(lidas[0].InheritToChildren);
        Assert.True(lidas[1].InheritToChildren);
        Assert.False(lidas[1].Enabled);
    }

    [Fact]
    public void OArquivoGravadoEEditavelAMao()
    {
        // O requisito é que dê para abrir e entender sem executar o NetLane.
        new JsonRuleStore(Arquivo).Save([new ProcessRule("Jogo", new LinkId("{A}"))]);

        var texto = File.ReadAllText(Arquivo);

        Assert.Contains("regras", texto, StringComparison.Ordinal);
        Assert.Contains("executavel", texto, StringComparison.Ordinal);
        Assert.Contains("Jogo", texto, StringComparison.Ordinal);
        Assert.Contains('\n', texto);
    }

    /// <summary>
    /// JSON corrompido não pode ser tratado como "nenhuma regra" e depois
    /// sobrescrito em silêncio: seria o usuário perder tudo por causa de um byte.
    /// </summary>
    [Fact]
    public void JsonCorrompidoEPreservadoEmQuarentena()
    {
        Directory.CreateDirectory(pasta);
        File.WriteAllText(Arquivo, "{ isto nao e json valido");

        var lidas = new JsonRuleStore(Arquivo).Load();

        Assert.Empty(lidas);
        Assert.False(File.Exists(Arquivo));
        Assert.True(File.Exists(Arquivo + ".invalido"));
        Assert.Contains("isto nao e json", File.ReadAllText(Arquivo + ".invalido"), StringComparison.Ordinal);
    }

    [Fact]
    public void EntradaSemExecutavelOuSemLinkEIgnorada()
    {
        Directory.CreateDirectory(pasta);
        File.WriteAllText(Arquivo, """
            { "regras": [
                { "executavel": "",     "link": "{A}" },
                { "executavel": "Jogo", "link": ""    },
                { "executavel": "Bom",  "link": "{B}" }
            ] }
            """);

        var lidas = new JsonRuleStore(Arquivo).Load();

        Assert.Single(lidas);
        Assert.Equal("Bom", lidas[0].ExecutableName);
    }

    public void Dispose()
    {
        if (Directory.Exists(pasta))
        {
            Directory.Delete(pasta, recursive: true);
        }

        GC.SuppressFinalize(this);
    }
}
