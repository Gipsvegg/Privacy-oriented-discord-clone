using System.ComponentModel.DataAnnotations;

namespace ikt201_project.Models;

public enum ChannelType { Text, Voice }

/// <summary>A single chat room</summary>
public class Channel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public ChannelType Type { get; set; }
    public bool ReadOnly { get; set; }

    public int Position { get; set; }  // stores the display order

    public int CategoryId { get; set; }
}

/// <summary>A titled group of channels</summary>
public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Position { get; set; }

    public int ServerId { get; set; }

    public List<Channel> Channels { get; set; } = new();
}

/// <summary>A server</summary>
public class Server
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";

    public string OwnerId { get; set; } = "";

    public List<Category> Categories { get; set; } = new();
}

/// <summary>Server data for the Homepage sidebar.</summary>
public class HomepageViewModel
{
    // All servers the user owns, shown as links in the sidebar.
    public List<Server> Servers { get; set; } = new();

    // Set only when the user has opened a server.
    public Server? CurrentServer { get; set; }
    public Channel? CurrentChannel { get; set; }
}

/// <summary>The data submitted by the "Create server" dialog.</summary>
public class CreateServerViewModel
{
    [Required, StringLength(32, MinimumLength = 2)]
    public string Name { get; set; } = "";

    // Must match one of the names in ServerTemplates.Options.
    public string Template { get; set; } = "Community";
}

/// <summary>The data submitted by the "Edit server" dialog.</summary>
public class EditServerViewModel
{
    public int Id { get; set; }

    [Required, StringLength(32, MinimumLength = 2)]
    public string Name { get; set; } = "";
}