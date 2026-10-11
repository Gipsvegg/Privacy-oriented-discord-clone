using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Data.BackgroundTasks;

public class DeleteOldMessagesFromDatabase(IServiceScopeFactory scopeFactory, ILogger<DeleteOldMessagesFromDatabase> logger)
    : BackgroundService
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(1);
    //private int _executionStep = 0;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Message deletion service started");
        using var timer = new PeriodicTimer(CheckInterval);
        do
        {
            try
            {
                //_executionStep++;
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var tooOld = DateTime.UtcNow - Lifetime;//as long as the timestamp is less than this, the message is less than 30 days old

                var messages = await db.Messages.Where(m => m.Timestamp < tooOld).ExecuteDeleteAsync(stoppingToken);
                var invites = await db.GroupInvites.Where(m => m.Timestamp < tooOld).ExecuteDeleteAsync(stoppingToken);
                var groups = await db.Conversations.Where(m => m.ConversationMembers.Count == 0).ExecuteDeleteAsync(stoppingToken);
                
                logger.LogInformation("Cleanup stats:\n      Messages deleted: {messages}, Invites deleted: {invites}, Groups deleted: {groups}", messages, invites, groups);

                /*var members = db.Users.Select(m => m.UserName).ToList();
                foreach (var member in members)
                {
                    logger.LogInformation("{_executionStep}: Member {Member} FOUND", _executionStep, member);
                }*/
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error occurred during message deletion");
            }
            
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}