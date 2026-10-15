using Microsoft.AspNetCore.Mvc;
using ikt201_project.Services;

namespace ikt201_project.ViewComponents;

public record FriendLink(string Id, string Name);

public class FriendsListViewComponent : ViewComponent
{
    private readonly IFriendService _friendService;

    public FriendsListViewComponent(IFriendService friendService)
    {
        _friendService = friendService;
    }

    public async Task<IViewComponentResult> InvokeAsync()
    {
        var userId = UserClaimsPrincipal.FindFirst(
            System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (userId == null)
            return View(new List<FriendLink>());

        var friends = await _friendService.GetFriendsAsync(userId);

        var links = friends
            .Select(f => new FriendLink(f.Id, f.UserName ?? "unknown"))
            .OrderBy(f => f.Name)
            .ToList();

        return View(links);
    }
}