namespace ikt201_project.Models;

public enum ChannelType { Text, Voice }

public record Channel(int Id, string Name, ChannelType Type, bool ReadOnly = false);
public record Category(string Name, List<Channel> Channels);
public record ChatServer(int Id, string Name, string Icon, List<Category> Categories);

public class ServersViewModel
{
    public List<ChatServer> Servers { get; set; } = new();
    public ChatServer Current { get; set; } = null!;
    public Channel? CurrentChannel { get; set; }
}