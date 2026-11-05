using System.Diagnostics;
using System.Reflection.Metadata.Ecma335;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using ikt201_project.Data;
using ikt201_project.Hubs;
using Microsoft.AspNetCore.SignalR;
using ikt201_project.Models.ViewModels;
using ikt201_project.Services;
using Microsoft.EntityFrameworkCore;


namespace ikt201_project.Controllers;

[Authorize]
[AutoValidateAntiforgeryToken]
public class DashboardController : Controller
{
    //Henter uuid til den som er logget inn
    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    
    //databasen
    private readonly ApplicationDbContext _db;
    //lar meldinger bli sett med engang isteden for å måtte reloade siden
    private readonly IHubContext<ChatHub> _hub;
    private readonly IFriendService _friendService;
    
    private const long RequestMaxSize = 10_000_000; //10MB | Tenker å sette dette som maxen for bilder
    private const int MaxNameLength = 30;
    
    public DashboardController(ApplicationDbContext db,  IHubContext<ChatHub> hub, IFriendService friendService) //setter opp database, hub og friendservice
    {
        _db = db;
        _hub = hub;
        _friendService = friendService;
    }

    private List<Group> GetGroups()
    {
        var groups = _db.Conversations
            .Where(m => m.ConversationMembers.Any(e => e.MemberId == CurrentUserId))
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new Group ( 
                m.ConversationId,
                m.ConversationName,
                m.ConversationMembers
                    .Select(e => new Member(e.Member.Id, e.Member.UserName ?? "PISSCORD USER MISSING", e.Role))
                    .ToArray(),
                m.IsDirect
                ))
            .ToList();
        
        return groups;
    }
    
    public IActionResult Homepage()
    {
        return View();
    }
    
    public async Task<IActionResult> Conversation(string id)
    {
        if(!Guid.TryParse(id, out _)) return  BadRequest();
        
        var groups = GetGroups();
        var group = groups.FirstOrDefault(m => m.ConversationId == id);

        if (group == null)
        {
            return NotFound();
        }

        var friends = await _friendService.GetFriendsAsync(CurrentUserId);
        ViewBag.FriendIds = friends.Select(f => f.Id).ToList();
        
        return PartialView(group);
    }
    
    public record NameChange(string ConversationId, string NewName);
    [HttpPost]
    public async Task<IActionResult> ConversationNameChange([FromBody] NameChange nameChange)
    {
        if (string.IsNullOrWhiteSpace(nameChange.ConversationId) || string.IsNullOrWhiteSpace(nameChange.NewName) || nameChange.NewName.Length > MaxNameLength) return  BadRequest("invalid package");
        if(!Guid.TryParse(nameChange.ConversationId, out _)) return  BadRequest("invalid conversation id");

        var members = await _db.ConversationMembers.Where(m => m.ConversationId == nameChange.ConversationId).ToListAsync();
        var isMember = members.Any(m => m.MemberId == CurrentUserId);
        if(!isMember) return StatusCode(403);

        var nameUpdate = await _db.Conversations
            .Where(m => m.ConversationId == nameChange.ConversationId)
            .ExecuteUpdateAsync(m => m.SetProperty(name => name.ConversationName, nameChange.NewName));
        
        if(nameUpdate == 0) return NotFound();

        await _hub.Clients.Users([.. members.Select(m => m.MemberId)]).SendAsync("ConversationNameChange", nameChange.ConversationId, nameChange.NewName);
        return Ok();
    }
    
    public async Task<IActionResult> ConversationMemberList(string id)
    {
        if(!Guid.TryParse(id, out _)) return  BadRequest("invalid conversation id");
        
        var groups = GetGroups();
        var group = groups.FirstOrDefault(m => m.ConversationId == id);

        if (group == null) return NotFound();
        
        var friends = await _friendService.GetFriendsAsync(CurrentUserId);
        ViewBag.FriendIds = friends.Select(f => f.Id).ToList();
        
        return PartialView(group);
    }

    //currently no check if user role is lower than their new role so can be used for demotion might change later
    public record PromotedMember(string MemberId, string ConversationId, Role Role);
    [HttpPost]
    public async Task<IActionResult> ConversationPromotion([FromBody] PromotedMember? memberPromotion)
    {
        if(memberPromotion == null) return BadRequest();
        if(string.IsNullOrWhiteSpace(memberPromotion.ConversationId) || string.IsNullOrWhiteSpace(memberPromotion.MemberId)) return  BadRequest("invalid package");
        if(!Guid.TryParse(memberPromotion.ConversationId, out _) || !Guid.TryParse(memberPromotion.MemberId, out _)) return  BadRequest("invalid id");
        if (!Enum.IsDefined(memberPromotion.Role)) return BadRequest("invalid role");
        if(memberPromotion.Role == Role.None) return BadRequest("Can't be demoted to nothing");
        if (memberPromotion.Role == Role.Owner) return BadRequest("Can't be promoted to owner");
        
        var conversation = await _db.ConversationMembers
            .Where(m => m.ConversationId == memberPromotion.ConversationId)
            .ToListAsync();
        
        var currentUserRole = conversation.Where(m => m.MemberId == CurrentUserId).Select(m => m.Role).FirstOrDefault();
        
        var isAdmin = conversation.Any(m => m.MemberId == CurrentUserId && Roles.IsAllowed(m.Role, Permissions.Promote));
        if (!isAdmin) return StatusCode(403);
        var isMember = conversation.Any(m => m.MemberId == memberPromotion.MemberId && Roles.IsHigherRank(currentUserRole, m.Role));
        if (!isMember) return NotFound();
        var rankTooLow = Roles.IsHigherRank(memberPromotion.Role, currentUserRole);
        if (rankTooLow) return StatusCode(403);
        
        var updated = await _db.ConversationMembers
            .Where(m => m.ConversationId == memberPromotion.ConversationId && m.MemberId == memberPromotion.MemberId)
            .ExecuteUpdateAsync(m => m.SetProperty(role => role.Role, memberPromotion.Role));

        if (updated == 0) return NotFound();

        var members = conversation.Select(m => m.MemberId).ToList();
        await _hub.Clients.Users(members).SendAsync("MembersChanged", memberPromotion.ConversationId);
        
        return Ok();
    }

    [HttpGet]
    public IActionResult FriendsList()
    {
        return ViewComponent("FriendsList");
    }

    [HttpGet]
    public IActionResult GroupsList()
    {
        return ViewComponent("GroupsList");
    }

    [HttpGet]
    public IActionResult ManageFriends()
    {
        return ViewComponent("FriendsList", new { invoker = "ManageFriends" });
    }

    [HttpGet]
    public IActionResult CreateGroup()
    {
        return ViewComponent("FriendsList", new { invoker = "groupCreator" });
    }

    public record SmallMessage(int Id, string ConversationId, string SenderId, string? SenderName, string ReceiverId, string Text, DateTime Timestamp);
    [HttpGet]
    public IActionResult Mailbox()
    {
        var userId = CurrentUserId;

        var messages = _db.Messages
            .Where(m => m.ReceiverId == userId)
            .OrderBy(m => m.Id)
            .Select(m => new SmallMessage(
                m.Id, 
                m.ConversationId,
                m.SenderId,
                m.Conversation.ConversationMembers
                    .Where(e => e.MemberId  == m.SenderId)
                    .Select(e => e.Member.UserName)
                    .FirstOrDefault(), 
                m.ReceiverId, 
                m.Text, 
                DateTime.SpecifyKind(m.Timestamp, DateTimeKind.Utc)))
            .ToList();
        
        return Ok(messages);
    }

    [HttpDelete]
    public IActionResult DeleteMessageFromDb(int id)
    { 
        _db.Messages.RemoveRange(_db.Messages.Where(m => m.Id == id && m.ReceiverId == CurrentUserId));
        _db.SaveChanges();
        
        return Ok();
    }

    private void MessageHandler(string conversationId, string text, List<ConversationMember> members)
    {
        //var members = _db.ConversationMembers.Where(m => m.ConversationId == conversationId && m.MemberId != CurrentUserId).ToList();
        var time = DateTime.UtcNow;
        
        foreach (var member in members)
        {
            if (member.MemberId == CurrentUserId) continue;
            _db.Messages.Add(new Message
            {
                SenderId = CurrentUserId, 
                ReceiverId = member.MemberId, 
                ConversationId = conversationId, 
                Text = text, 
                Timestamp = time
            });
        }
    }
    
    [HttpGet]
    public async Task<IActionResult> Friends()
    {
        var model = new FriendsViewModel
        {
            Friends = await _friendService.GetFriendsAsync(CurrentUserId),
            Incoming = await _friendService.GetIncomingAsync(CurrentUserId),
            Outgoing = await _friendService.GetOutgoingAsync(CurrentUserId)
        };
        return PartialView(model);
    }

    //checks whether the request is from a user or a fetch request
    //private bool IsFetch => Request.Headers.TryGetValue("Sec-Fetch-Mode", out var mode) && mode != "navigate";
    [HttpPost]
    public async Task<IActionResult> SendFriendRequest(string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            //TempData["Message"] = "Please enter a username.";
            return BadRequest("Username is required");
        }

        await _friendService.SendRequestAsync(CurrentUserId, username.Trim());

        //if (IsFetch) return Ok();
        // Same message whether the user exists or not, so the form can't be used to look up usernames
        //TempData["Message"] = "If that user exists, a friend request was sent.";
        var person = await _db.Users
            .Where(m => m.UserName == username)
            .Select(m => m.Id)
            .ToListAsync();
        //if(person.Count != 1) return NotFound();
        person.Add(CurrentUserId);
        var receiver = new List<string>{ person[0], "incomingFriend" };
        await _hub.Clients.Users(person).SendAsync("FriendListUpdate", receiver);
        return Ok();
    }

    [HttpPost]
    public async Task<IActionResult> AcceptFriend(int id)
    {
        var requesterId = await _friendService.AcceptRequestAsync(CurrentUserId, id);
        var receiver = new List<string>{ requesterId, "acceptedFriend" };   
        await _hub.Clients.Users([CurrentUserId, requesterId]).SendAsync("FriendListUpdate",  receiver);
        return Ok();
    }

    [HttpPost]
    public async Task<IActionResult> DeclineFriend(int id)
    {
        var addressee = await _friendService.DeclineRequestAsync(CurrentUserId, id);
        await _hub.Clients.Users([CurrentUserId, addressee]).SendAsync("FriendListUpdate");
        return Ok();
    }

    [HttpPost]
    public async Task<IActionResult> RemoveFriend(string friendId)
    {
        if(!Guid.TryParse(friendId, out _)) return  BadRequest("invalid id");
        await _friendService.RemoveFriendAsync(CurrentUserId, friendId);
        
        await _hub.Clients.Users([CurrentUserId, friendId]).SendAsync("FriendListUpdate");
        return Ok();
    }
    
    //sender meldingen til serveren og setter den inn i databasen, for å så bli sendt videre til andre i conversation
    [HttpPost]
    public async Task<IActionResult> SendMessage(string conversationId, string text)
    {
        if(!Guid.TryParse(conversationId, out _)) return  BadRequest("invalid id");
        //om du sender ingenting blir du skutt
        if (string.IsNullOrWhiteSpace(text)) return BadRequest();
        if (string.IsNullOrWhiteSpace(conversationId)) return BadRequest();
        var members = _db.ConversationMembers.Where(m => m.ConversationId == conversationId).ToList();
        if (members.Count == 0) return NotFound();
        if (members.All(member => member.MemberId != CurrentUserId)) return StatusCode(403);
        try
        {
            MessageHandler(conversationId, text, members);
            await _db.SaveChangesAsync();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
        
        foreach (var member in members)
        {
            if (member.MemberId == CurrentUserId) continue;
            await _hub.Clients.User(member.MemberId).SendAsync("ReceiveMessage");
        }
        
        return Ok();
    }

    public record CommitPackage(string ConversationId, int Epoch, string Commit);
    [HttpPost]
    public async Task<IActionResult> SubmitCommit([FromBody] CommitPackage commitPackage)
    {
        if (commitPackage?.Commit == null || commitPackage.Commit.Length == 0) return BadRequest("Commit is empty");
        if(!Guid.TryParse(commitPackage.ConversationId, out _)) return  BadRequest("invalid id");
        
        var conversation = await _db.Conversations.FindAsync(commitPackage.ConversationId);
        if (conversation == null) return NotFound();
        var members = _db.ConversationMembers.Where(m => m.ConversationId == conversation.ConversationId).ToList();
        if (members.All(member => member.MemberId != CurrentUserId))
        {
            return StatusCode(403);
        }
        if (commitPackage.Epoch != conversation.Epoch) return Conflict();

        try
        {
            conversation.Epoch++;
            MessageHandler(commitPackage.ConversationId, commitPackage.Commit, members);
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException e)
        {
            Console.WriteLine(e);
            return Conflict();
        }
        
        foreach (var member in members)
        {
            if (member.MemberId == CurrentUserId) continue;
            await _hub.Clients.User(member.MemberId).SendAsync("ReceiveMessage");
        }
        
        return Ok();
    }

    [HttpDelete]
    public async Task<IActionResult> LeaveGroup(string conversationId)
    {
        if(!Guid.TryParse(conversationId, out _)) return  BadRequest("invalid id");
        
        var isMember = await _db.ConversationMembers.AnyAsync(m => m.ConversationId == conversationId && m.MemberId == CurrentUserId);
        if(!isMember) return NotFound();
        var isDm = await _db.Conversations.AnyAsync(m => m.ConversationId == conversationId && m.IsDirect);
        if(isDm) return StatusCode(403);

        await using var transaction = await _db.Database.BeginTransactionAsync();
        
        var isOwner = await _db.ConversationMembers.AnyAsync(m => m.ConversationId == conversationId && m.MemberId == CurrentUserId  && m.Role == Role.Owner);
        if (isOwner)
        {
            var otherMembers = await _db.ConversationMembers
                .Where(m => m.ConversationId == conversationId && m.MemberId != CurrentUserId)
                .ToListAsync();
            var newOwner = otherMembers.OrderByDescending(m => m.Role).ThenBy(m => m.JoinedAt).FirstOrDefault();
            if (newOwner != null)
            {
                newOwner.Role = Role.Owner;
                await _db.SaveChangesAsync();
            }
        }

        var isDeleted = await _db.ConversationMembers.Where(m => m.ConversationId == conversationId && m.MemberId == CurrentUserId).ExecuteDeleteAsync();
        if(isDeleted != 1) return NotFound();
        await transaction.CommitAsync();
        
        var members = await _db.ConversationMembers.Where(m => m.ConversationId == conversationId).Select(m => m.MemberId).ToListAsync();
        await _hub.Clients.Users(members).SendAsync("MemberLeftGroup", CurrentUserId,  conversationId);
        
        return Ok();
    }

    public record RemovalPackage(string MemberId, string ConversationId);
    [HttpDelete]
    public async Task<IActionResult> RemoveFromGroup([FromBody]RemovalPackage removalPackage)
    {
        if(!Guid.TryParse(removalPackage.ConversationId, out _) || !Guid.TryParse(removalPackage.MemberId, out _)) return  BadRequest("invalid id");
        if(removalPackage.MemberId == CurrentUserId) return StatusCode(403);

        var members = await _db.ConversationMembers.Where(m =>
                m.ConversationId == removalPackage.ConversationId &&
                (m.MemberId == CurrentUserId || m.MemberId == removalPackage.MemberId))
            .Select(m => new {m.MemberId, m.Role}).ToListAsync();

        var currentUserRole = members.Where(m => m.MemberId == CurrentUserId).Select(m => m.Role).FirstOrDefault();
        var kickedUserRole =  members.Where(m => m.MemberId == removalPackage.MemberId).Select(m => m.Role).FirstOrDefault();
        
        
        var isDm = await _db.Conversations.AnyAsync(m => m.ConversationId == removalPackage.ConversationId && m.IsDirect);
        if(isDm) return StatusCode(403);
        
        var canKick = Roles.IsAllowed(currentUserRole, Permissions.Kick);
        if (!canKick) return StatusCode(403);

        var memberCanBeKicked = Roles.IsHigherRank(currentUserRole, kickedUserRole);
        if(memberCanBeKicked) return Conflict();

        var count = await _db.ConversationMembers
            .Where(m => m.ConversationId == removalPackage.ConversationId && m.MemberId == removalPackage.MemberId)
            .ExecuteDeleteAsync();
        
        if(count == 0) return NotFound();

        await _db.GroupInvites
            .Where(m => m.ConversationId == removalPackage.ConversationId && m.ReceiverId == removalPackage.MemberId)
            .ExecuteDeleteAsync();
        
        
        await _hub.Clients.User(removalPackage.MemberId).SendAsync("RemoveFromGroup", removalPackage.ConversationId);
        await _hub.Clients.Users(members.Select(m => m.MemberId)).SendAsync("MembersChanged", removalPackage.ConversationId);
        
        return Ok();
    }

    public record UploadKeyPackageRequest(byte[] KeyPackage);
    [HttpPost]
    public IActionResult UploadKeyPackage([FromBody] UploadKeyPackageRequest request)
    {
        if (request?.KeyPackage == null || request.KeyPackage.Length == 0) return BadRequest();

        var exists = _db.KeyPackages.Find(CurrentUserId);
        if (exists == null)
        {
            _db.KeyPackages.Add(new KeyPackage { UserId =  CurrentUserId, Data = request.KeyPackage });
        }
        else
        {
            exists.Data = request.KeyPackage;
        }
        _db.SaveChanges();
        
        return Ok();
    }

    [HttpGet]//downloads the public key package that a user has
    public IActionResult DownloadKeyPackage(string userId)
    {
        if(!Guid.TryParse(userId, out _)) return  BadRequest("invalid id");
        var keyPackage = _db.KeyPackages.Find(userId);
        if (keyPackage == null) return NotFound();
        
        return Ok(keyPackage.Data);
    }

    public record CreateConversation(string ConversationId, string ConversationName, bool IsDirect);
    [HttpPost]
    public IActionResult ConversationCreation([FromBody] CreateConversation? request)
    {
        if(request == null || string.IsNullOrWhiteSpace(request.ConversationName) || !Guid.TryParse(request.ConversationId, out _)) return BadRequest();
        if (request.ConversationName.Length > MaxNameLength) return BadRequest("conversation name is too long");
        var conversationId = request.ConversationId;
        try
        {
                _db.Conversations.Add(new Conversation { ConversationId = conversationId, ConversationName = request.ConversationName, CreatedAt = DateTime.UtcNow, CreatorId = CurrentUserId, IsDirect = request.IsDirect, Epoch = 1});
                _db.ConversationMembers.Add(new ConversationMember { ConversationId = conversationId, MemberId = CurrentUserId, JoinedAt = DateTime.UtcNow, Role = Role.Owner } );
                _db.SaveChanges();    
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
        
        return Ok();
    }

    public record UploadWelcome(string ReceiverId, string ConversationId, byte[] Welcome);
    [HttpPost]//Uploads the invitations to the group to the server
    public async Task<IActionResult> UploadGroupInvite([FromBody] UploadWelcome? welcome)
    {
        if (welcome == null || welcome?.Welcome == null || welcome.Welcome.Length == 0 || welcome.ReceiverId == CurrentUserId) return BadRequest();
        if(!Guid.TryParse(welcome.ConversationId, out _) || !Guid.TryParse(welcome.ReceiverId, out _)) return  BadRequest("invalid id");
        
        if (await _db.Conversations.FindAsync(welcome.ConversationId) == null) return NotFound();
        if (await _db.ConversationMembers.FindAsync([welcome.ConversationId, CurrentUserId]) == null) return StatusCode(403);
        if (await _db.Conversations.Where(m => m.ConversationId == welcome.ConversationId && m.ConversationMembers.Count >= 2 && m.IsDirect).AnyAsync()) return Conflict();
        
        var oldMembers = await _db.ConversationMembers
            .Where(m => m.ConversationId == welcome.ConversationId)
            .Select(m => m.MemberId)
            .ToArrayAsync();
        
        try
        {
            var exists = _db.GroupInvites.FirstOrDefault(m => (m.ReceiverId == welcome.ReceiverId && m.ConversationId == welcome.ConversationId)); 
            if (exists == null)
            {
                _db.GroupInvites.Add(new GroupInvite { ReceiverId = welcome.ReceiverId, SenderId = CurrentUserId, ConversationId = welcome.ConversationId, Data = welcome.Welcome, Timestamp = DateTime.UtcNow });
            }
            else
            {
                exists.Timestamp = DateTime.UtcNow;
                exists.SenderId = CurrentUserId;
                exists.Data = welcome.Welcome; 
            }

            if (await _db.ConversationMembers.FindAsync([welcome.ConversationId, welcome.ReceiverId]) == null)
            {
                _db.ConversationMembers.Add(new ConversationMember { ConversationId = welcome.ConversationId, JoinedAt = DateTime.UtcNow, MemberId = welcome.ReceiverId, Role = Role.Default });
            }
            
            await _db.SaveChangesAsync();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
            throw;
        }
        
        await _hub.Clients.User(welcome.ReceiverId).SendAsync("ReceiveGroupInvite", welcome.ConversationId);
        await _hub.Clients.Users(oldMembers).SendAsync("MembersChanged", welcome.ConversationId);
        
        return Ok();
    }
    
    private record SmallWelcome(int Id, string SenderId, string ConversationId, byte[] Data);
    [HttpGet]//sends the group invitation to the user
    public IActionResult DownloadWelcome()
    {
        var welcomes = _db.GroupInvites
            .Where(m => m.ReceiverId == CurrentUserId)
            .Select(m => new SmallWelcome(m.Id, m.SenderId, m.ConversationId, m.Data))
            .ToList();
        
        return Ok(welcomes);
    }

    [HttpDelete]//deletes the welcome after it has been received
    public IActionResult DeleteWelcome(int id)
    {
        _db.GroupInvites.RemoveRange(_db.GroupInvites.Where(m => m.Id == id && m.ReceiverId == CurrentUserId));
        _db.SaveChanges();
        
        return Ok();
    }
    
    //error? tok den bare fra HomeController
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}