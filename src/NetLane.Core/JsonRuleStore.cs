using System.Text.Json;
using System.Text.Json.Serialization;
using NetLane.Abstractions;

namespace NetLane.Core;

/// <summary>
/// As regras em JSON, no perfil do usuário.
///
/// JSON e não registro do Windows nem banco: o requisito é que as regras sejam
/// editáveis à mão, e é o formato que permite alguém abrir o arquivo e entender
/// o que o NetLane vai fazer sem executar o NetLane.
///
/// Escrita atômica (arquivo temporário e depois troca). Sem isso, um desligamento
/// no meio da gravação deixa um JSON truncado, e o usuário perde todas as regras
/// por causa de um byte.
/// </summary>
public sealed class JsonRuleStore : IRuleStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public JsonRuleStore(string? path = null)
    {
        Location = path ?? DefaultPath();
    }

    public string Location { get; }

    public static string DefaultPath() =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "NetLane",
            "regras.json");

    public IReadOnlyList<ProcessRule> Load()
    {
        if (!File.Exists(Location))
        {
            return [];
        }

        try
        {
            var json = File.ReadAllText(Location);
            var dto = JsonSerializer.Deserialize<RuleFile>(json, Options);
            if (dto?.Rules is null)
            {
                return [];
            }

            var result = new List<ProcessRule>(dto.Rules.Count);
            foreach (var r in dto.Rules)
            {
                if (string.IsNullOrWhiteSpace(r.Executable) || string.IsNullOrWhiteSpace(r.Link))
                {
                    continue;
                }

                result.Add(new ProcessRule(
                    r.Executable,
                    new LinkId(r.Link),
                    r.InheritToChildren,
                    r.Enabled));
            }

            return result;
        }
        catch (JsonException)
        {
            // JSON corrompido não pode derrubar o aplicativo nem, pior, ser
            // silenciosamente tratado como "nenhuma regra" e depois sobrescrito.
            // O arquivo é preservado com sufixo e o usuário começa limpo.
            var quarantine = Location + ".invalido";
            try
            {
                File.Move(Location, quarantine, overwrite: true);
            }
            catch (IOException)
            {
                // Se nem mover dá, seguir sem regras é melhor que não abrir.
            }

            return [];
        }
    }

    public void Save(IReadOnlyList<ProcessRule> rules)
    {
        var directory = Path.GetDirectoryName(Location);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var dto = new RuleFile
        {
            Rules = [.. rules.Select(r => new RuleDto
            {
                Executable = r.ExecutableName,
                Link = r.LinkId.Value,
                InheritToChildren = r.InheritToChildren,
                Enabled = r.Enabled,
            })],
        };

        var temp = Location + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(dto, Options));
        File.Move(temp, Location, overwrite: true);
    }

    private sealed class RuleFile
    {
        [JsonPropertyName("regras")]
        public List<RuleDto> Rules { get; set; } = [];
    }

    private sealed class RuleDto
    {
        [JsonPropertyName("executavel")]
        public string Executable { get; set; } = string.Empty;

        // O InterfaceGuid, e não o nome do adaptador: o nome muda quando o
        // usuário renomeia a conexão, e a regra sobreviveria mal a isso (D-003).
        [JsonPropertyName("link")]
        public string Link { get; set; } = string.Empty;

        [JsonPropertyName("herdarParaFilhos")]
        public bool InheritToChildren { get; set; }

        [JsonPropertyName("ativa")]
        public bool Enabled { get; set; } = true;
    }
}
