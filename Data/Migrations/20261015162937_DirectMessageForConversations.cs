using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ikt201_project.Data.Migrations
{
    /// <inheritdoc />
    public partial class DirectMessageForConversations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDirect",
                table: "Conversations",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDirect",
                table: "Conversations");
        }
    }
}
