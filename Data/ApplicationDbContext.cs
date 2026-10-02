using ikt201_project.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ikt201_project.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) {}
    
    public DbSet<Message> Messages { get; set; }
    public DbSet<KeyPackage>  KeyPackages { get; set; }
    public DbSet<GroupInvite> GroupInvites { get; set; }
}

