namespace ikt201_project.Models;

public static class Themes
{
    public static readonly Dictionary<string, string> ValidThemes = new Dictionary<string, string>()
    {
        // adding the name here lets you select in drop down menu in themes
        // left is name of your theme and right side is theme type light or dark
        {"default", "dark"},
        {"midnight", "dark"},
        {"paper",  "light"},
    };
}