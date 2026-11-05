using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ikt201_project.Data.Migrations
{
    /// <inheritdoc />
    public partial class RoleEnums : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE ConversationMembers SET Role = 'Admin' WHERE Role = 'admin'");
            migrationBuilder.Sql("UPDATE ConversationMembers SET Role = 'Default' WHERE Role = 'default'");
            migrationBuilder.Sql("UPDATE ConversationMembers SET Role = 'Owner' WHERE EXISTS(SELECT 1 FROM Conversations WHERE ConversationMembers.MemberId = Conversations.CreatorId AND ConversationMembers.ConversationId = Conversations.ConversationId)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE ConversationMembers SET Role = 'admin' WHERE Role = 'Admin'");
            migrationBuilder.Sql("UPDATE ConversationMembers SET Role = 'default' WHERE Role = 'Default'");
            migrationBuilder.Sql("UPDATE ConversationMembers SET Role = 'admin' WHERE Role = 'Owner')");
        }
    }
}
