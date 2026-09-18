using System.Diagnostics;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;

namespace ikt201_project.Controllers;

public class DashboardController : Controller
{
    private static List<Message> _messages = new List<Message>
    {
        //bestevenn ever
        new Message{SenderId = 2, Text = "gamer", Timestamp = DateTime.Now},
        
        //sender id er meg
        new Message{SenderId = 1, Text = "Kyss, klapp og klem", Timestamp = DateTime.Now},
    };
    
    private static FriendConversation _conversation = new FriendConversation
    {
        //beste venn ever er hvem vi har samtalen med
        messages = _messages, FriendId = 2
    };

    private static List<FriendConversation> _friendConversations = new List<FriendConversation>
    {
        _conversation
    };
    
    
    
    
    [Authorize]
    public IActionResult Homepage()
    {
        return View();
    }

    [Authorize]
    public IActionResult Conversation(int id)
    {
        List<Message> m = new List<Message>();
        foreach (var conversation in _friendConversations)
        {
            if (conversation.FriendId == id)
            {
                m = conversation.messages;
            }
        }
        
        return PartialView(m);
    }
    
    [HttpPost]
    public IActionResult SendMessage(int friendId, string text)
    {
        var newMessage = new Message { SenderId = 1, Text = text, Timestamp = DateTime.Now };

        FriendConversation? conversation = null;
        foreach (var c in _friendConversations)
        {
            if (c.FriendId == friendId)
            {
                conversation = c;
                break;
            }
        }

        if (conversation != null)
        {
            conversation.messages.Add(newMessage);
        }
        else
        {
            conversation = new FriendConversation
            {
                FriendId = friendId,
                messages = new List<Message> { newMessage }
            };
            _friendConversations.Add(conversation);
        }

        return PartialView("Conversation", conversation.messages);
    }
    
    
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}