using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Models;

public class Message
{
    public int Id { get; set; }
    public string SenderId { get; set; } = "";
    public string ReceiverId { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTime Timestamp { get; set; }
}

public class KeyPackage
{
    [Key] public string UserId { get; set; } = "";  // filled from CurrentUserId
    public byte[] Data { get; set; } = [];
}

[Index(nameof(ReceiverId), nameof(ConversationId), IsUnique = true)] 
public class GroupInvite
{
    public int Id { get; set; }
    public string ReceiverId { get; set; } = "";
    public string SenderId { get; set; } = "";
    public string ConversationId { get; set; } = "";
    public byte[] Data { get; set; } = [];
    public DateTime Timestamp { get; set; }
}