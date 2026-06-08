# Lead Details API - Testing Guide

## Quick Start

After running the seed data, you'll have 10 test leads with full details. Use these to test the lead details page API.

---

## Test Leads Included in Seed Data

### 1. **Rahul Sharma** (Hot Prospect)
- **Lead ID:** `l1000001-0000-0000-0000-000000000001`
- **Status:** Qualified
- **Stage:** Proposal
- **Score:** 92.5 (High priority)
- **Company:** TechCorp India
- **Email:** rahul.sharma@techcorp.in
- **Contains:** 2 opportunities, 4 tasks, 4 emails, 4 interactions, 6 history entries, 3 notes

✅ **Best for testing:** Complete lead with multiple related items

---

### 2. **Priya Patel** (Warm Lead)
- **Lead ID:** `l1000001-0000-0000-0000-000000000002`
- **Status:** Contacted
- **Stage:** Discovery
- **Score:** 76.3
- **Company:** Infosys
- **Email:** priya.patel@infosys.com
- **Contains:** 1 opportunity, 2 tasks, 2 emails, 2 interactions, 2 history entries, 2 notes

✅ **Best for testing:** Lead in active discovery phase

---

### 3. **Amit Kumar** (High-Value Deal)
- **Lead ID:** `l1000001-0000-0000-0000-000000000003`
- **Status:** Qualified
- **Stage:** Negotiation
- **Score:** 88.7 (Large deal)
- **Company:** Wipro
- **Email:** amit.kumar@wipro.com
- **Contains:** 2 opportunities ($500k+), 2 tasks, 1 email, 1 interaction, 2 history entries

✅ **Best for testing:** Enterprise-level deal tracking

---

### 4. **Sneha Reddy** (New Lead)
- **Lead ID:** `l1000001-0000-0000-0000-000000000004`
- **Status:** New
- **Stage:** New
- **Score:** 45.2 (Low engagement)
- **Company:** TCS
- **Email:** sneha.reddy@tcs.com
- **Contains:** Minimal data (just created)

✅ **Best for testing:** New lead onboarding flow

---

### 5. **Vikram Singh** (Cold Lead)
- **Lead ID:** `l1000001-0000-0000-0000-000000000005`
- **Status:** Cold
- **Stage:** New
- **Score:** 32.1 (Low priority)
- **Company:** HCL Technologies
- **Email:** vikram.singh@hcl.com
- **Contains:** No activities

✅ **Best for testing:** Disengaged lead handling

---

### 6. **Anita Desai** (Won Deal)
- **Lead ID:** `l1000001-0000-0000-0000-000000000006`
- **Status:** Converted
- **Stage:** Closed
- **Score:** 95.8 (Highest score)
- **Company:** Reliance Industries
- **Email:** anita.desai@reliance.com
- **Contains:** 1 opportunity (WON - $250k), 1 task, 1 email, 1 interaction

✅ **Best for testing:** Closed deal - success case

---

### 7. **Rajesh Gupta** (Lost Deal)
- **Lead ID:** `l1000001-0000-0000-0000-000000000007`
- **Status:** Lost
- **Stage:** Closed
- **Score:** 58.4
- **Company:** Tata Motors
- **Email:** rajesh.gupta@tatamotors.com
- **Contains:** Closed deal history

✅ **Best for testing:** Lost deal analysis

---

### 8. **Meera Nair** (Unqualified)
- **Lead ID:** `l1000001-0000-0000-0000-000000000008`
- **Status:** Unqualified
- **Stage:** Discovery
- **Score:** 38.9
- **Company:** Flipkart
- **Email:** meera.nair@flipkart.com

✅ **Best for testing:** Disqualification workflow

---

### 9. **John Smith** (International)
- **Lead ID:** `l1000001-0000-0000-0000-000000000009`
- **Status:** Qualified
- **Stage:** Proposal
- **Score:** 81.5
- **Company:** Acme Corporation (USA)
- **Email:** john.smith@acmecorp.com
- **Contains:** 1 opportunity (Pilot - $25k)

✅ **Best for testing:** International leads

---

### 10. **Sarah Johnson** (Complex Deal)
- **Lead ID:** `l1000001-0000-0000-0000-000000000010`
- **Status:** Qualified
- **Stage:** Negotiation
- **Score:** 89.3
- **Company:** GlobalTech Solutions
- **Email:** sarah.johnson@globaltech.com
- **Contains:** 1 opportunity ($320k), multiple stakeholders

✅ **Best for testing:** Complex deal with legal review

---

## API Testing Examples

### 1. Get List of All Leads
```bash
curl -X GET "http://localhost:3000/leads?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": "l1000001-0000-0000-0000-000000000001",
      "name": "Rahul Sharma",
      "email": "rahul.sharma@techcorp.in",
      "phone": "+91-9876543210",
      "company": "TechCorp India",
      "source": "campaign",
      "stage": "proposal",
      "status": "qualified",
      "lead_score": 92.5,
      "created_at": "2024-12-05T10:30:00Z",
      "assigned_to": "u1000001-0000-0000-0000-000000000001",
      "updated_at": "2024-12-18T15:45:00Z"
    },
    ...
  ],
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

---

### 2. Get Lead Details (Click on Lead)
This is the main API call when you click on a lead in the UI.

```bash
# Simple - just lead info
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Full - with all related data
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001?include=all" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Custom - specific relations
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001?include=scores,opportunities,tasks,emails,interactions,history" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response for Rahul Sharma:**
```json
{
  "data": {
    "id": "l1000001-0000-0000-0000-000000000001",
    "name": "Rahul Sharma",
    "email": "rahul.sharma@techcorp.in",
    "phone": "+91-9876543210",
    "company": "TechCorp India",
    "source": "campaign",
    "stage": "proposal",
    "status": "qualified",
    "lead_score": 92.5,
    "description": "VP of Sales at TechCorp India. Very interested in our enterprise solution.",
    "linkedin_url": "https://linkedin.com/in/rahul-sharma-123",
    "website": "https://techcorp.in",
    "industry": "Technology",
    "employee_count": "5000+",
    "created_at": "2024-12-05T10:30:00Z",
    "updated_at": "2024-12-18T15:45:00Z",
    "assigned_user": {
      "id": "u1000001-0000-0000-0000-000000000001",
      "name": "Jane Smith",
      "email": "jane.smith@company.com",
      "avatar_url": "https://i.pravatar.cc/150?img=1"
    },
    "current_score": {
      "id": "s1000001-0000-0000-0000-000000000001",
      "score": 92.5,
      "confidence": 0.95,
      "factors": {
        "engagement": 0.95,
        "firmographic": 0.90,
        "intent": 0.98,
        "budget": 0.88
      },
      "prediction": "likely",
      "created_at": "2024-12-18T10:00:00Z"
    },
    "opportunities": [
      {
        "id": "o1000001-0000-0000-0000-000000000001",
        "title": "TechCorp Enterprise License - 100 seats",
        "type": "sales",
        "status": "open",
        "stage": "proposal",
        "value": 150000.00,
        "probability": 75,
        "expected_closed_at": "2025-02-01T00:00:00Z",
        "created_at": "2024-12-09T10:00:00Z"
      },
      {
        "id": "o1000001-0000-0000-0000-000000000002",
        "title": "TechCorp Implementation Services",
        "type": "sales",
        "status": "open",
        "stage": "proposal",
        "value": 45000.00,
        "probability": 70,
        "expected_closed_at": "2025-02-24T00:00:00Z",
        "created_at": "2024-12-04T10:00:00Z"
      }
    ],
    "tasks": [
      {
        "id": "t1000001-0000-0000-0000-000000000001",
        "subject": "Schedule demo call with Rahul",
        "priority": "high",
        "status": "completed",
        "due_date": "2024-12-08T00:00:00Z",
        "created_at": "2024-12-05T10:00:00Z"
      },
      {
        "id": "t1000001-0000-0000-0000-000000000002",
        "subject": "Send customized proposal",
        "priority": "high",
        "status": "completed",
        "due_date": "2024-12-15T00:00:00Z",
        "created_at": "2024-12-03T10:00:00Z"
      },
      {
        "id": "t1000001-0000-0000-0000-000000000003",
        "subject": "Follow up on proposal - check status",
        "priority": "high",
        "status": "open",
        "due_date": "2024-12-23T00:00:00Z",
        "created_at": "2024-12-13T10:00:00Z"
      },
      {
        "id": "t1000001-0000-0000-0000-000000000004",
        "subject": "Prepare CFO presentation slides",
        "priority": "urgent",
        "status": "open",
        "due_date": "2024-12-27T00:00:00Z",
        "created_at": "2024-12-15T10:00:00Z"
      }
    ],
    "emails": [
      {
        "id": "e1000001-0000-0000-0000-000000000001",
        "subject": "Introducing CRM Pro - Your Sales Superpower",
        "to_email": "rahul.sharma@techcorp.in",
        "status": "opened",
        "read_at": "2024-12-08T10:00:00Z",
        "created_at": "2024-12-10T10:00:00Z"
      },
      {
        "id": "e1000001-0000-0000-0000-000000000002",
        "subject": "Quick follow-up: Let's schedule your demo",
        "to_email": "rahul.sharma@techcorp.in",
        "status": "opened",
        "read_at": "2024-12-08T10:00:00Z",
        "created_at": "2024-12-07T10:00:00Z"
      },
      {
        "id": "e1000001-0000-0000-0000-000000000003",
        "subject": "Your Customized Proposal - TechCorp Enterprise Package",
        "to_email": "rahul.sharma@techcorp.in",
        "status": "opened",
        "read_at": "2024-12-08T10:00:00Z",
        "created_at": "2024-12-05T10:00:00Z"
      },
      {
        "id": "e1000001-0000-0000-0000-000000000004",
        "subject": "Checking in: Proposal review status?",
        "to_email": "rahul.sharma@techcorp.in",
        "status": "sent",
        "created_at": "2024-12-13T10:00:00Z"
      }
    ],
    "interactions": [
      {
        "id": "i1000001-0000-0000-0000-000000000001",
        "channel": "phone",
        "subject": "Initial discovery call with Rahul",
        "status": "completed",
        "priority": "high",
        "last_activity_at": "2024-12-09T00:00:00Z",
        "created_at": "2024-12-07T10:00:00Z"
      },
      {
        "id": "i1000001-0000-0000-0000-000000000002",
        "channel": "meeting",
        "subject": "Product demo presentation",
        "status": "completed",
        "priority": "high",
        "last_activity_at": "2024-12-04T00:00:00Z",
        "created_at": "2024-12-01T10:00:00Z"
      },
      {
        "id": "i1000001-0000-0000-0000-000000000003",
        "channel": "phone",
        "subject": "Proposal discussion with Rahul",
        "status": "completed",
        "priority": "high",
        "last_activity_at": "2024-12-07T00:00:00Z",
        "created_at": "2024-12-05T10:00:00Z"
      },
      {
        "id": "i1000001-0000-0000-0000-000000000004",
        "channel": "email",
        "subject": "Ongoing email discussions",
        "status": "open",
        "priority": "normal",
        "last_activity_at": "2024-12-16T00:00:00Z",
        "created_at": "2024-12-09T10:00:00Z"
      }
    ],
    "history": [
      {
        "id": "h1000001-0000-0000-0000-000000000001",
        "action": "created",
        "field_changed": null,
        "old_value": null,
        "new_value": null,
        "timestamp": "2024-12-05T10:00:00Z",
        "changed_by": "u1000001-0000-0000-0000-000000000004"
      },
      {
        "id": "h1000001-0000-0000-0000-000000000002",
        "action": "status_updated",
        "field_changed": "status",
        "old_value": "new",
        "new_value": "contacted",
        "timestamp": "2024-12-10T00:00:00Z",
        "changed_by": "u1000001-0000-0000-0000-000000000001"
      },
      {
        "id": "h1000001-0000-0000-0000-000000000003",
        "action": "stage_updated",
        "field_changed": "stage",
        "old_value": "new",
        "new_value": "discovery",
        "timestamp": "2024-12-15T00:00:00Z",
        "changed_by": "u1000001-0000-0000-0000-000000000001"
      },
      {
        "id": "h1000001-0000-0000-0000-000000000004",
        "action": "status_updated",
        "field_changed": "status",
        "old_value": "contacted",
        "new_value": "qualified",
        "timestamp": "2024-12-28T00:00:00Z",
        "changed_by": "u1000001-0000-0000-0000-000000000001"
      }
    ]
  }
}
```

---

### 3. Get Lead Summary (Quick view)
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/summary" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "data": {
    "id": "l1000001-0000-0000-0000-000000000001",
    "name": "Rahul Sharma",
    "email": "rahul.sharma@techcorp.in",
    "phone": "+91-9876543210",
    "company": "TechCorp India",
    "source": "campaign",
    "stage": "proposal",
    "status": "qualified",
    "lead_score": 92.5,
    "metrics": {
      "opportunities_count": 2,
      "tasks_count": 4,
      "emails_count": 4,
      "interactions_count": 4
    }
  }
}
```

---

### 4. Get Opportunities for Lead
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/opportunities" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 5. Get Tasks for Lead
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/tasks?status=open" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 6. Get Email History for Lead
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/emails" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 7. Get Notes for Lead
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/notes" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 8. Get History/Timeline for Lead
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/history" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 9. Add Note to Lead
```bash
curl -X POST "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/add-note" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Customer mentioned budget approval expected next week",
    "type": "follow_up"
  }'
```

---

### 10. Update Lead Status
```bash
curl -X POST "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/update-status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "qualified",
    "stage": "proposal",
    "reason": "Customer showed strong interest",
    "notes": "Ready to move to proposal stage"
  }'
```

---

### 11. Get Next Steps & Recommendations
```bash
curl -X GET "http://localhost:3000/leads/l1000001-0000-0000-0000-000000000001/next-steps" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 12. Get Statistics Overview
```bash
curl -X GET "http://localhost:3000/leads/stats/overview" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "total": 10,
  "by_status": {
    "new": 1,
    "contacted": 1,
    "qualified": 5,
    "unqualified": 1,
    "converted": 1,
    "lost": 1
  },
  "by_stage": {
    "new": 2,
    "discovery": 2,
    "proposal": 3,
    "negotiation": 2,
    "closed": 1
  },
  "by_source": {
    "campaign": 3,
    "referral": 2,
    "import": 2,
    "form": 2,
    "api": 1
  },
  "average_score": 72.8
}
```

---

## Frontend Integration Examples

### React Hook for Fetching Lead Details
```jsx
const [lead, setLead] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  const fetchLead = async () => {
    try {
      const response = await fetch(
        `/api/leads/${leadId}?include=all`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Lead not found');
      
      const { data } = await response.json();
      setLead(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  fetchLead();
}, [leadId, token]);
```

---

## Testing Checklist

- [ ] List all leads - pagination works
- [ ] Click lead #1 (Rahul) - full details load with all relations
- [ ] Click lead #4 (Sneha) - minimal data loads
- [ ] Click lead #6 (Anita) - won deal displays correctly
- [ ] Click lead #7 (Rajesh) - lost deal displays correctly
- [ ] View opportunities for lead #3 (Amit) - $500k deal shows
- [ ] View tasks - open vs completed filter works
- [ ] View emails - read/opened status shows
- [ ] View interactions - channels display correctly
- [ ] View history - chronological order correct
- [ ] Add note - successfully creates new note
- [ ] Update status - history entry created
- [ ] Get summary - metrics count correct
- [ ] Get next steps - recommendations appear
- [ ] Get stats - aggregates correct

---

## Performance Notes

- **Lead detail endpoint:** ~50-200ms (depending on included relations)
- **Parallel queries:** All related data fetched in parallel
- **Pagination:** Supports up to 100 items per page
- **Caching:** Recommended to cache lead summary for 5 minutes

---

## Notes

- All dates are in ISO 8601 format (UTC)
- Lead scores are decimal numbers (0-100)
- Probabilities are integers (0-100)
- Monetary values use NUMERIC type (precise to 2 decimals)
- UUIDs are used for all IDs
- Timestamps use TIMESTAMPTZ (timezone-aware)

