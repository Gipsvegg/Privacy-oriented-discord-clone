using System.Text.Json.Serialization;
using Microsoft.CodeAnalysis.Elfie.Model.Structures;

namespace ikt201_project.Models;

[Flags]
public enum Permissions
{
    None = 0,
    Kick = 1 << 0,
    Promote = 1 << 1,
    Rename = 1 << 2,
    Invite = 1 << 3,
}

[JsonConverter(typeof(JsonStringEnumConverter<Role>))]
public enum Role
{
    None = 0,
    Default = 1,
    Admin =2,
    Owner = 4,
} 

public static class Roles
{
    private const Permissions Owner = Permissions.Kick | Permissions.Promote | Permissions.Rename | Permissions.Invite;
    private const Permissions Admin =  Permissions.Kick | Permissions.Promote | Permissions.Rename | Permissions.Invite;
    private const Permissions Default = Permissions.Rename | Permissions.Invite;
    private static readonly Dictionary<Role, Permissions> roles = 
        new Dictionary<Role, Permissions>
        {
            { Role.Owner, Owner },
            { Role.Admin, Admin }, 
            { Role.Default, Default },
        };

    private static Permissions GetPermissions(Role role)
    {
        var perms = roles.GetValueOrDefault(role);
        return perms;
    }

    //checks if left side is higher rank than the right
    public static bool IsHigherRank(Role roleCheck, Role role)
    {
        var check = roleCheck > role;
        return check;
    }
    
    public static bool IsAllowed(Role role,  Permissions permissions)
    { 
        var perms = GetPermissions(role);
        return perms.HasFlag(permissions);
    }
}


