# DevTrail

> Performance review evidence tracking and career development platform powered by AI

**Version 2.0** - Now a full-stack Next.js application with database integration!

---

## ✨ What's New in v2.0

DevTrail has been completely rebuilt as a modern web application:

- 🎨 **Web UI** - No more CLI scripts! Everything accessible through an intuitive web interface
- 💾 **Database** - All data stored in SQLite via Prisma (programmatically queryable!)
- ⚡ **Workers** - Background job processing for long-running tasks
- 📊 **Real-time** - Live progress updates on sync and report generation
- 🔄 **Job Queue** - Async processing with status tracking
- 📱 **Modern Stack** - Next.js 16 + React 19 + Mantine UI + TypeScript

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up database
npm run db:generate
npm run db:migrate

# Start development server
npm run dev
```

Then open **http://localhost:4000**

---

## 🎯 Features

### Evidence Tracking
- **GitHub PRs** - Automatic sync with AI-powered criteria matching
- **Jira Tickets** - Link tickets to PRs and track project work
- **Slack Messages** - Add achievements from Slack (with screenshot analysis!)
- **Manual Evidence** - Add custom achievements anytime

### Analytics & Reports
- **Component Analysis** - Identify code ownership and leadership
- **Evidence Reports** - Detailed breakdown by performance criteria
- **AI Summaries** - Concise narrative summaries of your work
- **Capitalization Reports** - Track capitalizable software development

### Goal Management
- **SMART Goals** - AI-assisted goal generation based on your evidence
- **Progress Tracking** - Automatic evidence-to-goal matching
- **Milestone Planning** - Break goals into actionable milestones
- **Progress Reports** - See how you're tracking against targets

### Review Tools
- **Interactive Reviews** - Guided performance review responses
- **Upward Reviews** - Generate feedback for your manager
- **Resume Generation** - Auto-generated resumes from your evidence
- **Review Packages** - Complete performance review bundles

---

## 📁 Project Structure

```
devtrail/
├── app/                    # Next.js app routes
│   ├── api/               # API endpoints
│   ├── evidence/          # Evidence management UI
│   ├── reports/           # Report generation UI
│   ├── goals/             # Goal management UI
│   └── analytics/         # Analytics dashboards
├── lib/                    # Shared libraries
│   ├── workers/           # Background job workers
│   ├── services/          # Business logic
│   └── db/                # Database utilities
├── prisma/                 # Database schema and migrations
│   └── schema.prisma      # Database models
├── components/             # React components
├── scripts/                # Admin and migration scripts
└── docs/                   # Documentation
```

---

## 🛠️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL="file:./prisma/dev.db"

# GitHub
GITHUB_TOKEN="your_github_personal_access_token"
GITHUB_USERNAME="your_username"
REPOS="owner/repo1,owner/repo2"

# Jira (optional)
JIRA_HOST="your-domain.atlassian.net"
JIRA_EMAIL="your-email@example.com"
JIRA_API_TOKEN="your_jira_api_token"
JIRA_PROJECTS="ONE,TWO"

# Anthropic (for AI features)
ANTHROPIC_API_KEY="your_anthropic_api_key"
CLAUDE_MODEL="claude-sonnet-4-20250514"

# User Context (for personalized AI responses)
USER_CONTEXT="I am a senior developer focused on..."
```

### Required API Keys

#### GitHub Token
Create a personal access token with these scopes:
- `repo` (full control of private repos)
- `read:org` (read org membership)
- `read:user` (read user profile)
- `user:email` (access email addresses)

[Create Token](https://github.com/settings/tokens/new?scopes=repo,read:org,read:user,user:email&description=DevTrail)

#### Anthropic API Key
Get an API key from [Anthropic Console](https://console.anthropic.com/)

#### Jira API Token (Optional)
Generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## 📋 Available Commands

### Development

```bash
npm run dev              # Start Next.js dev server (port 4000)
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
```

### Database

```bash
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run database migrations
npm run db:push          # Push schema changes to database
npm run db:studio        # Open Prisma Studio (database GUI)
```

### Workers

```bash
npm run worker           # Start background worker for job processing
```

### Data Migration

```bash
npm run import-data      # Import existing processed-prs.json
npm run import-goals     # Import existing goals
npm run migrate-reports  # Import old markdown reports to database
```

### Deprecated CLI Commands

The following commands are deprecated. Use the web UI instead:

```bash
npm run sync             # ⚠️  Use http://localhost:4000/sync
npm run report           # ⚠️  Use http://localhost:4000/reports
npm run goals            # ⚠️  Use http://localhost:4000/goals
npm run components       # ⚠️  Use http://localhost:4000/analytics
# ... (see package.json for full list)
```

---

## 🔄 Migration from v1.x

If you're upgrading from the old CLI-based DevTrail:

### 1. Import Existing Data

```bash
# Import processed PRs
npm run import-data

# Import old markdown reports
npm run migrate-reports

# Import goals from lattice directory
npm run import-goals
```

### 2. Update Your Workflow

**Old Way:**
```bash
npm run sync           # Sync GitHub
npm run report --ai    # Generate report
npm run goals          # Generate goals
```

**New Way:**
1. Start the app: `npm run dev`
2. Visit http://localhost:4000
3. Use the web UI for all operations

### 3. Configuration Changes

**Old:** `config.json` in root
**New:** `.env` file (see Configuration section above)

### 4. Data Storage

**Old:** JSON files in `/data/`, markdown in `/reports/`
**New:** SQLite database in `/prisma/dev.db`

**Benefits:**
- ✅ Programmatically queryable
- ✅ Relational data integrity
- ✅ Full CRUD operations via API
- ✅ Real-time updates
- ✅ No more file conflicts

---

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 16, React 19, Mantine UI, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite with Prisma ORM
- **AI**: Anthropic Claude API
- **Workers**: Node.js background processors
- **Deployment**: Vercel-ready

### Data Flow

```
1. User Action (UI) → API Route
2. API Route → Create Job (status: PENDING)
3. Worker → Process Job (status: RUNNING)
4. Worker → Save Results to Database
5. Worker → Update Job (status: COMPLETED)
6. UI → Poll for Updates → Display Results
```

### Database Models

- **EvidenceEntry** - PRs, Slack messages, manual evidence
- **Criterion** - Performance review criteria
- **Report** - Generated reports (stored as markdown)
- **Goal** - SMART goals with milestones
- **Job** - Async job queue
- **Config** - Application configuration
- **ReviewDocument** - Performance review documents
- **ReviewAnalysis** - AI analysis results

See `prisma/schema.prisma` for complete schema.

---

## 📖 Documentation

- [Migration Plan](docs/MIGRATION_PLAN.md) - Detailed v1 → v2 migration guide
- [Worker Setup](docs/WORKER_SETUP.md) - Background worker architecture
- [Database Integration](docs/DATABASE_INTEGRATION_AUDIT.md) - Database design audit
- [Google Drive Integration](docs/GOOGLE_DRIVE_INTEGRATION.md) - Import from Google Docs
- [UI Integration Map](docs/UI_INTEGRATION_MAP.md) - UI component mapping

---

## 🧪 Development

### Run Tests

```bash
npm test                 # Run test suite (coming soon)
```

### Database Workflows

```bash
# View data
npm run db:studio

# Reset database (⚠️  deletes all data)
rm prisma/dev.db
npm run db:migrate

# Create migration after schema changes
npm run db:migrate
```

### Worker Development

The worker runs in a separate process and polls for jobs every minute:

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: Worker
npm run worker
```

For faster development, trigger workers manually via API or reduce poll interval.

---

## 🚢 Deployment

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Add all .env variables
```

### Cron Setup

Configure Vercel cron to run worker:

```json
// vercel.json
{
  "crons": [{
    "path": "/api/workers/process",
    "schedule": "* * * * *"
  }]
}
```

---

## 🤝 Contributing

This is a personal project, but suggestions and bug reports are welcome!

---

## 📝 License

ISC

---

## 🎉 Acknowledgments

Built with:
- [Anthropic Claude](https://anthropic.com) - AI analysis
- [Next.js](https://nextjs.org) - React framework
- [Prisma](https://prisma.io) - Database ORM
- [Mantine](https://mantine.dev) - UI components
- [Octokit](https://octokit.github.io/) - GitHub API
- [Jira Client](https://www.npmjs.com/package/jira-client) - Jira API

---

**Questions?** Check the [documentation](docs/) or [open an issue](https://github.com/aaronmaturen/devtrail/issues).
