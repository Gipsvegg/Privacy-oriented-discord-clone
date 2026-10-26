namespace ikt201_project.Models;

//The preset channel layouts a new server can start from.
public static class ServerTemplates
{
    // Shown as choices on the Create page. Build() below must handle every name here
    public static readonly (string Name, string Description)[] Options =
    {
        ("Community", "Info, text and voice channels for a gaming group or community."),
        ("Friends",   "A small private server: one chat, one media channel and a voice room."),
        ("Empty",     "Just a #general channel. Add the rest yourself."),
    };

    //Builds the categories and channels for a template. Unknown names give "Empty"
    public static List<Category> Build(string template)
    {
        var categories = template switch
        {
            "Community" => new List<Category>
            {
                Cat("Info",  Text("welcome", readOnly: true), Text("rules", readOnly: true)),
                Cat("Text",  Text("general"), Text("off-topic")),
                Cat("Voice", Voice("General"), Voice("Gaming")),
            },
            "Friends" => new List<Category>
            {
                Cat("Text",  Text("chat"), Text("media")),
                Cat("Voice", Voice("Hangout")),
            },
            _ => new List<Category>
            {
                Cat("Text", Text("general")),
            },
        };

        // Save the list order as Position numbers
        for (var i = 0; i < categories.Count; i++)
        {
            categories[i].Position = i;
            for (var j = 0; j < categories[i].Channels.Count; j++)
                categories[i].Channels[j].Position = j;
        }
        return categories;
    }

    private static Category Cat(string name, params Channel[] channels) =>
        new() { Name = name, Channels = channels.ToList() };

    private static Channel Text(string name, bool readOnly = false) =>
        new() { Name = name, Type = ChannelType.Text, ReadOnly = readOnly };

    private static Channel Voice(string name) =>
        new() { Name = name, Type = ChannelType.Voice };
}