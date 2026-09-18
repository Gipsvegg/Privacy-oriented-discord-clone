namespace ikt201_project.Models;

public class Message
{
    public int SenderId { get; set; }
    public  string Text { get; set; }
    public DateTime Timestamp { get; set; }
}

public class FriendConversation
{
    public List<Message> messages { get; set; }
    public int FriendId { get; set; }
}