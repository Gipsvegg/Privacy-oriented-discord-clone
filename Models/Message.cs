using System.ComponentModel.DataAnnotations;
using ikt201_project.Data;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Models;

public class Message
{
    public int Id { get; set; }
    public string SenderId { get; set; } = "";
    public ApplicationUser Sender { get; set; } = null!;
    public string ConversationId { get; set; } = "";
    public Conversation Conversation { get; set; } = null!;
    public string ReceiverId { get; set; } = "";
    public ApplicationUser Receiver { get; set; } = null!;
    public string Text { get; set; } = "";
    public DateTime Timestamp { get; set; }
}

public class Conversation
{
    [Key] public string ConversationId { get; set; } = "";
    public string ConversationName { get; set; } = "";
    [ConcurrencyCheck]public int Epoch { get; set; } = 0;
    public string CreatorId { get; set; } = "";
    public bool IsDirect { get; set; } = false;
    public DateTime CreatedAt { get; set; }
    public IList<ConversationMember> ConversationMembers { get; } =  new List<ConversationMember>();
    public IList<Message> Messages { get; } =  new List<Message>();
    public IList<GroupInvite> Invites { get; } =  new List<GroupInvite>();
}

[PrimaryKey(nameof(ConversationId), nameof(MemberId))]
[Index(nameof(MemberId))]
public class ConversationMember
{
    public string ConversationId { get; set; } = "";
    public Conversation Conversation { get; set; } = null!;
    public string MemberId { get; set; } = "";
    public ApplicationUser Member { get; set; } = null!;
    public string Role { get; set; } = "";
    public DateTime JoinedAt { get; set; }
}

public class KeyPackage
{
    [Key] public string UserId { get; set; } = "";  // filled from CurrentUserId
    public ApplicationUser User { get; set; } = null!;
    public byte[] Data { get; set; } = [];   // The PUBLIC key package to the user 
}

[Index(nameof(ReceiverId), nameof(ConversationId), IsUnique = true)] 
public class GroupInvite
{
    public int Id { get; set; }
    public string ReceiverId { get; set; } = "";
    public ApplicationUser Receiver { get; set; } = null!;
    public string SenderId { get; set; } = "";
    public ApplicationUser Sender { get; set; } = null!;
    public string ConversationId { get; set; } = "";
    public Conversation Conversation { get; set; } = null!;
    public byte[] Data { get; set; } = [];
    public DateTime Timestamp { get; set; }
}

public record Member(string MemberName, string Role);
public record Group(string ConversationId, string ConversationName, Member[] Members, bool IsDirect);