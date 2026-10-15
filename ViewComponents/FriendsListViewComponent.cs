using ikt201_project.Data;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Services;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.ViewComponents;

public record FriendLink(string Id, string? ConversationId, string Name);
public record DmConversation(string ConversationId, string? FriendId);

public class FriendsListViewComponent : ViewComponent
{
    private readonly IFriendService _friendService;
    private readonly ApplicationDbContext _db;

    public FriendsListViewComponent(IFriendService friendService,  ApplicationDbContext db)
    {
        _friendService = friendService;
        _db = db;
    }

    public async Task<IViewComponentResult> InvokeAsync()
    {
        var userId = UserClaimsPrincipal.FindFirst(
            System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (userId == null)
            return View(new List<FriendLink>());

        var friends = await _friendService.GetFriendsAsync(userId);

        var links = friends
            .Select(f => new FriendLink(f.Id, null,f.UserName ?? "PISSCORD USER MISSING"))
            .OrderBy(f => f.Name)
            .ToList();


        var conversations = await _db.Conversations
            .Where(m => m.IsDirect == true && m.ConversationMembers.Any(i => i.MemberId == userId))
            .Select(m => new DmConversation(m.ConversationId, m.ConversationMembers
                .Select(i => i.MemberId)
                .FirstOrDefault(i => i != userId)))
            .ToListAsync();


        var lookup = conversations
            .Where(m => m.FriendId != null)
            .DistinctBy(m => m.FriendId)
            .ToDictionary(m  => m.FriendId, m => m.ConversationId);
        
        var dmConvoList = new List<FriendLink>();
        foreach (var link in links)
        {
            var dm = lookup.GetValueOrDefault(link.Id);
            if (dm == null)
            {
                dmConvoList.Add(new FriendLink(link.Id, null, link.Name));
            }
            else
            {
                dmConvoList.Add(new FriendLink(link.Id,dm,  link.Name ));
            }
        }

        return View(dmConvoList);
    }
}