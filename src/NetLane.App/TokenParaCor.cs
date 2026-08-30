using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace NetLane.App;

/// <summary>
/// Resolve um token da rampa ("raia-3") no pincel correspondente.
///
/// Um conversor e não um binding direto porque a cor de um link é atribuída em
/// runtime, pela ordem estável dos GUIDs — o XAML não pode saber de antemão
/// qual link é qual.
/// </summary>
public sealed class TokenParaCor : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var token = value as string;
        if (!string.IsNullOrEmpty(token) &&
            Application.Current?.TryFindResource(token) is SolidColorBrush brush)
        {
            return brush;
        }

        // Token desconhecido não pode virar exceção numa célula de grade: cair
        // no cinza neutro degrada a informação sem derrubar a tela.
        return Application.Current?.TryFindResource("Fumo") as SolidColorBrush
               ?? Brushes.Gray;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        throw new NotSupportedException("A cor é derivada do link; não se edita pela interface.");
}
