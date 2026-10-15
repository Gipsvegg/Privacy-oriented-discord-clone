using ikt201_project.Data;

namespace ikt201_project.Models.ViewModels;

public class FriendsViewModel
{
    public List<ApplicationUser> Friends { get; set; } = new();
    public List<Friendship> Incoming { get; set; } = new();
    public List<Friendship> Outgoing { get; set; } = new();
}