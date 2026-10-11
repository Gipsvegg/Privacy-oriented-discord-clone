using ikt201_project.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{ 
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) {}
    
    public DbSet<Message> Messages { get; set; }
    public DbSet<Conversation> Conversations { get; set; }
    public DbSet<ConversationMember> ConversationMembers { get; set; }
    public DbSet<KeyPackage>  KeyPackages { get; set; }
    public DbSet<GroupInvite> GroupInvites { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<KeyPackage>()
            .HasOne(k => k.User)
            .WithOne()
            .HasForeignKey<KeyPackage>(k => k.UserId);
    }
}

