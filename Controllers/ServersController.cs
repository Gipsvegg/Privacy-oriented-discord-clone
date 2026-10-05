using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ikt201_project.Models;

namespace ikt201_project.Controllers;

[Authorize]  // Only logged-in users can reach this controller. Everyone else is sent to the login page.
public class ServersController : Controller
{
    // Hardcoded sample data
    // TODO: load servers from the database instead.
    private static readonly List<ChatServer> Servers = new()
    {
        new(1, "Town Square", "TS", new()
        {
            new("Info", new() {
                new(1, "welcome", ChannelType.Text, true),
                new(2, "rules", ChannelType.Text, true),
                new(3, "privacy-info", ChannelType.Text, true) }),
            new("General", new() {
                new(4, "general", ChannelType.Text),
                new(5, "introductions", ChannelType.Text),
                new(6, "off-topic", ChannelType.Text) }),
            new("Gaming", new() {
                new(7, "looking-for-group", ChannelType.Text),
                new(8, "game-chat", ChannelType.Text) }),
            new("Voice", new() {
                new(9, "Lounge", ChannelType.Voice),
                new(10, "Gaming 1", ChannelType.Voice) })
        }),
        new(2, "My Community", "MC", new()
        {
            new("Info", new() {
                new(11, "welcome", ChannelType.Text, true),
                new(12, "rules", ChannelType.Text, true) }),
            new("Text", new() {
                new(13, "general", ChannelType.Text),
                new(14, "off-topic", ChannelType.Text) }),
            new("Voice", new() {
                new(15, "General", ChannelType.Voice),
                new(16, "Gaming", ChannelType.Voice) })
        }),
        new(3, "Friends", "F", new()
        {
            new("Text", new() { new(17, "chat", ChannelType.Text), new(18, "media", ChannelType.Text) }),
            new("Voice", new() { new(19, "Hangout", ChannelType.Voice) })
        })
    };
    
    // Shows the servers page for one server and one channel.
    // Both values come from the URL, e.g. /Servers/Index/2?channelId=14.
    // Without them, it shows server 1 and its first text channel.
    public IActionResult Index(int id = 1, int? channelId = null)
    {
        // Look up the server
        var server = Servers.FirstOrDefault(s => s.Id == id);
        if (server == null) return NotFound();

        // Look up the channel
        var channels = server.Categories.SelectMany(c => c.Channels).ToList();  // List of all channels
        var channel = channels.FirstOrDefault(c => c.Id == channelId)
                      ?? channels.FirstOrDefault(c => c.Type == ChannelType.Text); // If channel is null, chose the first channel

        return View(new ServersViewModel
        {
            Servers = Servers,
            Current = server,
            CurrentChannel = channel
        });
    }
}