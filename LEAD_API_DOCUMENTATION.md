# Lead Details API Documentation

## Overview

Complete backend API for the lead details page, including lead management, scoring, history tracking, notes, opportunities, tasks, emails, and interactions.

## Database Schema

### Core Tables

#### 1. **users**
Stores team members who can be assigned to leads and activities.

```sql
- id (UUID) - Primary key
- email (TEXT) - Unique email
- name (TEXT) - User name
- avatar_url (TEXT) - Avatar URL
- role (TEXT) - 'admin', 'manager', 'user', 'viewer'
- status (TEXT) - 'active', 'inactive', 'invited'
- created_at, updated_at (TIMESTAMPTZ)
```

#### 2. **leads** (Main Lead Table)
Core lead information with qualification and assignment tracking.

```sql
- id (UUID) - Primary key
- name (TEXT) - Lead name
- email (TEXT) - Email address (unique)
- phone (TEXT) - Phone number
- company (TEXT) - Company name
- source (TEXT) - 'manual', 'import', 'form', 'api', 'integration', 'campaign', 'referral', 'web'
- stage (TEXT) - 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed'
- status (TEXT) - 'new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost', 'cold'
- lead_score (NUMERIC) - Score 0-100
- description (TEXT) - Lead description
- linkedin_url (TEXT) - LinkedIn profile
- website (TEXT) - Company website
- industry (TEXT) - Industry vertical
- employee_count (TEXT) - Company size
- assigned_to (UUID) - FK to users
- created_at, updated_at (TIMESTAMPTZ)

Indexes: email, status, stage, source, assigned_to, lead_score, created_at
```

#### 3. **lead_scores**
Historical lead scoring data for AI/ML predictions.

```sql
- id (UUID)
- lead_id (UUID) - FK to leads
- score (NUMERIC) - Score value
- confidence (NUMERIC) - Confidence 0-1
- factors (JSONB) - Score factors
- prediction (TEXT) - 'likely', 'unlikely', 'maybe'
- created_at (TIMESTAMPTZ)
```

#### 4. **lead_history**
Audit trail of all changes to a lead.

```sql
- id (UUID)
- lead_id (UUID) - FK to leads
- action (TEXT) - Type of change
- field_changed (TEXT) - Which field changed
- old_value (TEXT) - Previous value
- new_value (TEXT) - New value
- reason (TEXT) - Reason for change
- notes (TEXT) - Additional notes
- timestamp (TIMESTAMPTZ)
- changed_by (UUID) - FK to users
```

#### 5. **lead_notes**
Notes and comments on leads for team collaboration.

```sql
- id (UUID)
- lead_id (UUID) - FK to leads
- content (TEXT) - Note content
- type (TEXT) - 'general', 'internal', 'follow_up'
- created_by (UUID) - FK to users
- created_at, updated_at (TIMESTAMPTZ)
```

#### 6. **opportunities**
Sales opportunities linked to leads.

```sql
- id (UUID)
- lead_id (UUID) - FK to leads
- title (TEXT)
- type (TEXT) - 'sales', 'partnership', 'upsell', 'cross_sell', 'renewal'
- status (TEXT) - 'open', 'won', 'lost', 'on_hold'
- stage (TEXT) - 'discovery', 'proposal', 'negotiation', 'closed'
- value (NUMERIC) - Deal value
- probability (INTEGER) - 0-100%
- expected_closed_at (TIMESTAMPTZ)
- assigned_to (UUID) - FK to users
- created_at, updated_at (TIMESTAMPTZ)
```

#### 7. **tasks**
Tasks/activities assigned to leads, opportunities, or contacts.

```sql
- id (UUID)
- subject (TEXT)
- description (TEXT)
- entity_type (TEXT) - 'lead', 'opportunity', 'contact', 'account'
- entity_id (UUID) - ID of the related entity
- priority (TEXT) - 'low', 'normal', 'high', 'urgent'
- status (TEXT) - 'open', 'completed', 'cancelled'
- due_date (TIMESTAMPTZ)
- assigned_to (UUID) - FK to users
- created_at, updated_at (TIMESTAMPTZ)
```

#### 8. **email_sends**
Email communication history.

```sql
- id (UUID)
- campaign_id (UUID) - FK to campaigns (optional)
- entity_type (TEXT) - 'lead', 'opportunity', 'contact', 'account'
- entity_id (UUID) - ID of related entity
- to_email (TEXT)
- subject (TEXT)
- status (TEXT) - 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
- read_at, clicked_at (TIMESTAMPTZ)
- created_at, updated_at (TIMESTAMPTZ)
```

#### 9. **interactions**
Interactions with leads (calls, meetings, messages).

```sql
- id (UUID)
- lead_id (UUID) - FK to leads
- channel (TEXT) - 'email', 'phone', 'meeting', 'chat', 'social', 'other'
- subject (TEXT)
- status (TEXT) - 'open', 'completed', 'closed'
- priority (TEXT) - 'low', 'normal', 'high', 'urgent'
- assigned_to (UUID) - FK to users
- last_activity_at (TIMESTAMPTZ)
- created_at, updated_at (TIMESTAMPTZ)
```

#### 10. **bulk_uploads**
Track bulk lead imports.

```sql
- id (UUID)
- file_name (TEXT)
- file_url (TEXT)
- entity_type (TEXT) - 'lead', 'contact', 'opportunity'
- status (TEXT) - 'pending', 'processing', 'completed', 'failed'
- total_records, processed_records, success_count, error_count (INTEGER)
- error_details (JSONB)
- uploaded_by (UUID) - FK to users
- created_at, updated_at (TIMESTAMPTZ)
```

## API Endpoints

### Lead CRUD Operations

#### 1. List All Leads
```http
GET /leads
```

**Query Parameters:**
- `page` (integer, default: 1) - Page number
- `limit` (integer, default: 20, max: 100) - Results per page
- `search` (string) - Search name, email, company, phone
- `status` (string) - Filter by status
- `stage` (string) - Filter by stage
- `source` (string) - Filter by source
- `assigned_to` (uuid) - Filter by assignee
- `sort` (string, default: 'created_at') - Sort field
- `order` (string, default: 'desc') - 'asc' or 'desc'

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "company": "Acme Corp",
      "source": "manual",
      "stage": "contacted",
      "status": "qualified",
      "lead_score": 75.5,
      "created_at": "2024-01-15T10:30:00Z",
      "assigned_to": "uuid",
      "updated_at": "2024-01-20T15:45:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

#### 2. Get Lead Details
```http
GET /leads/:id
```

**Query Parameters:**
- `include` (string, comma-separated) - Relations to include
  - `scores` - Current lead score
  - `opportunities` - Related opportunities
  - `tasks` - Related tasks
  - `emails` - Email history
  - `interactions` - Interactions
  - `history` - Change history
  - `all` - Include everything

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "company": "Acme Corp",
    "source": "campaign",
    "stage": "proposal",
    "status": "qualified",
    "lead_score": 85.3,
    "description": "VP of Sales at Acme Corp",
    "linkedin_url": "https://linkedin.com/in/johndoe",
    "website": "https://acme.com",
    "industry": "Technology",
    "employee_count": "500-1000",
    "assigned_to": "uuid",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-20T15:45:00Z",
    "assigned_user": {
      "id": "uuid",
      "name": "Jane Smith",
      "email": "jane@company.com",
      "avatar_url": "https://..."
    },
    "current_score": {
      "id": "uuid",
      "score": 85.3,
      "confidence": 0.92,
      "factors": { "engagement": 0.9, "firmographic": 0.8 },
      "prediction": "likely",
      "created_at": "2024-01-20T10:00:00Z"
    },
    "opportunities": [
      {
        "id": "uuid",
        "title": "$50K Software License Deal",
        "type": "sales",
        "status": "open",
        "stage": "proposal",
        "value": 50000,
        "probability": 75,
        "expected_closed_at": "2024-02-28T00:00:00Z",
        "created_at": "2024-01-18T10:30:00Z"
      }
    ],
    "tasks": [
      {
        "id": "uuid",
        "subject": "Schedule demo call",
        "priority": "high",
        "status": "open",
        "due_date": "2024-01-25T14:00:00Z",
        "created_at": "2024-01-20T09:00:00Z"
      }
    ],
    "emails": [
      {
        "id": "uuid",
        "subject": "Re: Your proposal",
        "to_email": "john@example.com",
        "status": "opened",
        "read_at": "2024-01-20T11:30:00Z",
        "created_at": "2024-01-19T14:00:00Z"
      }
    ],
    "interactions": [
      {
        "id": "uuid",
        "channel": "phone",
        "subject": "Initial discovery call",
        "status": "completed",
        "priority": "normal",
        "last_activity_at": "2024-01-20T15:00:00Z"
      }
    ],
    "history": [
      {
        "id": "uuid",
        "action": "status_updated",
        "field_changed": "status",
        "old_value": "contacted",
        "new_value": "qualified",
        "timestamp": "2024-01-20T10:15:00Z",
        "changed_by": "uuid"
      }
    ]
  }
}
```

#### 3. Create Lead
```http
POST /leads
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "company": "Acme Corp",
  "phone": "+1234567890",
  "source": "manual",
  "stage": "new",
  "status": "new",
  "assigned_to": "uuid (optional)",
  "description": "VP of Sales",
  "linkedin_url": "https://linkedin.com/in/johndoe",
  "website": "https://acme.com",
  "industry": "Technology",
  "employee_count": "500-1000"
}
```

**Response:** (201 Created)
```json
{
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    ...
  }
}
```

#### 4. Update Lead
```http
PUT /leads/:id
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "status": "qualified",
  "stage": "proposal",
  "lead_score": 85.3,
  "assigned_to": "uuid"
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    ...
  }
}
```

#### 5. Delete Lead
```http
DELETE /leads/:id
```

**Response:** (204 No Content)

---

### Lead Assignment

#### Assign Lead to User
```http
POST /leads/:id/assign
Content-Type: application/json

{
  "assigned_to": "uuid"
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "assigned_to": "uuid",
    ...
  }
}
```

---

### Lead Status & History

#### Update Lead Status
```http
POST /leads/:id/update-status
Content-Type: application/json

{
  "status": "qualified",
  "stage": "proposal",
  "reason": "High engagement with demo",
  "notes": "Customer showed strong interest"
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "status": "qualified",
    "stage": "proposal",
    ...
  }
}
```

#### Get Lead History
```http
GET /leads/:id/history?page=1&limit=20&action=status_updated
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "action": "status_updated",
      "field_changed": "status",
      "old_value": "new",
      "new_value": "contacted",
      "timestamp": "2024-01-20T10:15:00Z",
      "changed_by": "uuid"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

#### Get Activity Timeline
```http
GET /leads/:id/timeline?limit=50&offset=0
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "status_change",
      "action": "status_updated",
      "field": "status",
      "old_value": "new",
      "new_value": "contacted",
      "timestamp": "2024-01-20T10:15:00Z",
      "changed_by": "uuid"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### Lead Notes

#### Add Note
```http
POST /leads/:id/add-note
Content-Type: application/json

{
  "content": "Customer is very interested in the enterprise plan",
  "type": "general"
}
```

Types: `general`, `internal`, `follow_up`

**Response:** (201 Created)
```json
{
  "data": {
    "id": "uuid",
    "lead_id": "uuid",
    "content": "Customer is very interested in the enterprise plan",
    "type": "general",
    "created_by": "uuid",
    "created_at": "2024-01-20T15:45:00Z"
  }
}
```

#### Get Notes
```http
GET /leads/:id/notes?page=1&limit=20&type=general
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "lead_id": "uuid",
      "content": "Customer is very interested",
      "type": "general",
      "created_by": "uuid",
      "created_at": "2024-01-20T15:45:00Z"
    }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

---

### Lead Qualifying

#### Qualify/Disqualify Lead
```http
POST /leads/:id/qualify
Content-Type: application/json

{
  "status": "qualified",
  "reason": "Company size matches ICP"
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "status": "qualified",
    ...
  }
}
```

---

### Lead Summary & Metrics

#### Get Lead Summary
```http
GET /leads/:id/summary
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "company": "Acme Corp",
    "source": "campaign",
    "stage": "proposal",
    "status": "qualified",
    "lead_score": 85.3,
    "metrics": {
      "opportunities_count": 2,
      "tasks_count": 5,
      "emails_count": 12,
      "interactions_count": 8
    }
  }
}
```

#### Get Lead Statistics
```http
GET /leads/stats/overview
```

**Response:**
```json
{
  "total": 450,
  "by_status": {
    "new": 120,
    "contacted": 180,
    "qualified": 100,
    "unqualified": 30,
    "converted": 15,
    "lost": 5,
    "cold": 0
  },
  "by_stage": {
    "new": 120,
    "contacted": 180,
    "qualified": 100,
    "proposal": 30,
    "negotiation": 15,
    "closed": 5
  },
  "by_source": {
    "manual": 50,
    "import": 100,
    "form": 150,
    "api": 75,
    "campaign": 50,
    "referral": 25
  },
  "average_score": 62.4
}
```

---

### Related Entities

#### Get Opportunities for Lead
```http
GET /leads/:id/opportunities?page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "$50K Software License Deal",
      "type": "sales",
      "assigned_to": "uuid",
      "status": "open",
      "stage": "proposal",
      "value": 50000,
      "probability": 75,
      "expected_closed_at": "2024-02-28T00:00:00Z",
      "created_at": "2024-01-18T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

#### Get Tasks for Lead
```http
GET /leads/:id/tasks?page=1&limit=20&status=open
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "subject": "Schedule demo call",
      "priority": "high",
      "status": "open",
      "assigned_to": "uuid",
      "due_date": "2024-01-25T14:00:00Z",
      "created_at": "2024-01-20T09:00:00Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

#### Get Emails for Lead
```http
GET /leads/:id/emails?page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "subject": "Re: Your proposal",
      "to_email": "john@example.com",
      "status": "opened",
      "read_at": "2024-01-20T11:30:00Z",
      "created_at": "2024-01-19T14:00:00Z"
    }
  ],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

#### Get Interactions for Lead
```http
GET /leads/:id/interactions?page=1&limit=20&channel=phone
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "channel": "phone",
      "subject": "Discovery call",
      "status": "completed",
      "priority": "normal",
      "assigned_to": "uuid",
      "last_activity_at": "2024-01-20T15:00:00Z",
      "created_at": "2024-01-18T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 8,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

#### Get Next Steps & Recommendations
```http
GET /leads/:id/next-steps
```

**Response:**
```json
{
  "data": {
    "open_tasks": [
      {
        "id": "uuid",
        "subject": "Schedule demo call",
        "priority": "high",
        "due_date": "2024-01-25T14:00:00Z"
      }
    ],
    "recommendations": [
      {
        "id": "send_proposal",
        "title": "Send formal proposal",
        "description": "Lead is qualified and ready for proposal",
        "priority": "high",
        "action_type": "email"
      },
      {
        "id": "demo_offer",
        "title": "Offer a product demo",
        "description": "Show the lead your product in action",
        "priority": "high",
        "action_type": "meeting"
      }
    ]
  }
}
```

---

## Error Handling

All endpoints use consistent error responses:

**Validation Error (400):**
```json
{
  "error": "Validation Error",
  "message": "Invalid request data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

**Not Found (404):**
```json
{
  "error": "Not Found",
  "message": "Lead not found"
}
```

**Database Error (500):**
```json
{
  "error": "Database error",
  "message": "Connection timeout"
}
```

---

## Authentication

All endpoints require authentication via:
1. **Bearer Token** - `Authorization: Bearer <token>`
2. **Cookie** - `crm_token=<token>` (JWT)
3. **API Key** - `Authorization: ApiKey crm_<key>`

Set in `.env`:
```
JWT_SECRET=your-secret-key
API_KEY_SALT=your-salt
```

---

## Performance Considerations

### Pagination
- Default limit: 20 items per page
- Maximum limit: 100 items per page
- Always use pagination for list endpoints

### Indexes
Database indexes are optimized for:
- Lead lookup by email
- Filtering by status, stage, source
- Sorting by created_at, lead_score
- Assignments by assigned_to

### Parallel Loading
The lead detail endpoint fetches all related data in parallel for optimal performance:
- Lead basic info
- Scores
- Opportunities
- Tasks
- Emails
- Interactions
- History
- User assignment

---

## Setup Instructions

### 1. Apply Database Schema
```bash
# Using Supabase CLI
supabase db push

# Or manually run supabase/schema.sql in your Supabase SQL editor
```

### 2. Start the Backend
```bash
npm install
npm start
```

### 3. Test the API
```bash
# List leads
curl -X GET http://localhost:3000/leads \
  -H "Authorization: Bearer <token>"

# Get lead details
curl -X GET http://localhost:3000/leads/<lead-id> \
  -H "Authorization: Bearer <token>"

# Create lead
curl -X POST http://localhost:3000/leads \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "company": "Acme Corp"
  }'
```

---

## Features Summary

✅ **Full CRUD Operations** - Create, read, update, delete leads
✅ **Advanced Filtering** - Search, filter by status/stage/source
✅ **Lead Scoring** - Track AI-generated lead scores
✅ **Change History** - Full audit trail of all modifications
✅ **Team Collaboration** - Assign leads, add notes, track interactions
✅ **Related Entities** - Opportunities, tasks, emails, interactions
✅ **Activity Timeline** - Unified view of all lead activities
✅ **Performance Optimized** - Parallel queries, proper indexing
✅ **Authentication** - JWT, API key, and cookie-based auth
✅ **Error Handling** - Consistent error responses with details

