using System.Windows;
using System.Windows.Controls;
using NetLane.Core;
using NetLane.Windows;

namespace NetLane.App;

public partial class MainWindow : Window
{
    private readonly MainViewModel model;

    /// <summary>
    /// Composition root da interface. É o único lugar do aplicativo que sabe que
    /// existe uma implementação de Windows — todo o resto conhece só os
    /// contratos de Abstractions.
    /// </summary>
    public MainWindow()
    {
        InitializeComponent();

        model = new MainViewModel(
            new WindowsLinkRegistry(),
            new WindowsProcessRegistry(),
            new JsonRuleStore());

        DataContext = model;
    }

    private void AoAtualizar(object sender, RoutedEventArgs e) => model.Refresh();

    /// <summary>
    /// Preenche o seletor de link de uma linha e marca o que já está atribuído.
    ///
    /// Feito no Loaded e não por binding porque a lista de opções depende do
    /// estado dos links no momento em que a célula aparece, e só links prontos
    /// entram (D-011): oferecer um link sem gateway seria oferecer perda de
    /// conectividade num menu.
    /// </summary>
    private void AoCarregarSeletor(object sender, RoutedEventArgs e)
    {
        if (sender is not ComboBox combo || combo.Tag is not ProcessRow row)
        {
            return;
        }

        combo.SelectionChanged -= AoAtribuir;

        combo.Items.Clear();
        combo.Items.Add(new ComboBoxItem { Content = "— o Windows escolhe —", Tag = null });

        foreach (var link in model.Links)
        {
            if (!link.CanBeAssigned)
            {
                continue;
            }

            var item = new ComboBoxItem { Content = link.DisplayName, Tag = link };
            combo.Items.Add(item);

            if (row.Rule is not null && row.Rule.LinkId == link.Id)
            {
                combo.SelectedItem = item;
            }
        }

        combo.SelectedIndex = combo.SelectedIndex < 0 ? 0 : combo.SelectedIndex;
        combo.SelectionChanged += AoAtribuir;
    }

    private void AoAtribuir(object sender, SelectionChangedEventArgs e)
    {
        if (sender is not ComboBox combo ||
            combo.Tag is not ProcessRow row ||
            combo.SelectedItem is not ComboBoxItem item)
        {
            return;
        }

        model.Assign(row, item.Tag as LinkColumn);
    }
}
