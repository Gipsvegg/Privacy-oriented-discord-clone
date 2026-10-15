using System.ComponentModel.DataAnnotations;

namespace ikt201_project.Models;

public enum ChannelType { Text, Voice }

public class Channel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public ChannelType Type { get; set; }
    public bool ReadOnly { get; set; }
    public int Position { get; set; }  // stores the display order
    public int CategoryId { get; set; }
}

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Position { get; set; }
    public int ServerId { get; set; }
    public List<Channel> Channels { get; set; } = new();
}

public class Server
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";
    public string OwnerId { get; set; } = "";
    public List<Category> Categories { get; set; } = new();
}
public class HomepageViewModel
{
    public List<Server> Servers { get; set; } = new();

    public Server? CurrentServer { get; set; }
    public Channel? CurrentChannel { get; set; }
}

public class CreateServerViewModel
{
    [Required, StringLength(32, MinimumLength = 2)]
    public string Name { get; set; } = "";

    // Must match one of the names in ServerTemplates.Options.
    public string Template { get; set; } = "Community";
}