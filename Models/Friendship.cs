using ikt201_project.Data;
namespace ikt201_project.Models;

public enum FriendshipStatus { Pending, Accepted, Blocked }

public class Friendship
{
    public int Id { get; set; }
    public string RequesterId { get; set; } = default!;
    public string AddresseeId { get; set; } = default!;
    public FriendshipStatus Status { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser Requester { get; set; } = default!;
    public ApplicationUser Addressee { get; set; } = default!;
}