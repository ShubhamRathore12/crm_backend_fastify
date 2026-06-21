'use strict';

const { v4: uuidv4 } = require('uuid');

// ============================================================
// Opportunity reference data + seed rows.
// Ported verbatim from the frontend mock (opp-data.ts) so the
// LeadSquared-style Opportunities screen renders identical data,
// now served from the backend.
// ============================================================

const OWNERS = [
  { name: 'Viraj Parsekar', email: 'viraj.parsekar@stoxkart.com' },
  { name: 'Anish Mahadaye', email: 'anish.mahadaye@stoxkart.com' },
  { name: 'Amar Singh', email: 'amar.singh@stoxkart.com' },
  { name: 'Faizan Shaikh', email: 'faizan.shaikh@stoxkart.com' },
  { name: 'Amolraj Sinah', email: 'amolraj.sinah@stoxkart.com' },
];

const STATUSES = [
  'Open - Not Connected',
  'Open - Connected',
  'Open - Callback',
  'Won',
  'Lost',
];

const STAGES = [
  'Prospect',
  'Personal Details',
  'Bank Details',
  'PAN Details',
  'Document',
  'Won',
  'Lost',
];

const BROAD_PRODUCTS = [
  'STX Trading Account',
  'STX Research Subscription',
  'STX Telegram Equity Ka Funda',
  'IIBX Account',
];

const COMPANIES = ['Stoxkart', 'SMC', 'IIBX'];

const TASK_TYPES = [
  { group: 'APPOINTMENT', items: ['Call back Requested', 'Follow-up CALL', 'Meeting', 'Zoom Webinar'] },
  { group: 'TODO', items: ['Send Documents', 'Verify KYC', 'Collect Payment', 'Schedule Demo'] },
];

const ACTIVITY_TYPES = [
  'Opportunity Qualification',
  'Product Opportunity',
  'Email Sent',
  'Note Added',
];

function getReferenceData() {
  return { OWNERS, STATUSES, STAGES, BROAD_PRODUCTS, COMPANIES, TASK_TYPES, ACTIVITY_TYPES };
}

const BASE = [
  { name: 'Prasanta patari', createdOn: '2026-06-05T17:46:00', agentAssigned: '2026-06-05T18:02:00', noOfAttempts: 8, ownerUpdate: '2026-06-05 18:02:20', owner: 'Viraj Parsekar' },
  { name: 'DEVKARAN RATHORE', createdOn: '2026-06-03T10:11:00', agentAssigned: '2026-06-03T10:26:00', noOfAttempts: 7, ownerUpdate: '2026-06-03 10:26:55', owner: 'Viraj Parsekar', email: 'dkrathore415@gmail.com', broadProduct: 'STX Telegram Equity Ka Funda', source: 'STX Research Subscription' },
  { name: 'Pankaj bafna', createdOn: '2026-06-12T00:32:00', agentAssigned: '2026-06-12T10:18:00', noOfAttempts: 7, ownerUpdate: '2026-06-12 10:18:28', owner: 'Anish Mahadaye' },
  { name: 'Pardeep sidhu', createdOn: '2026-06-06T15:21:00', agentAssigned: '2026-06-06T15:36:00', noOfAttempts: 6, ownerUpdate: '2026-06-06 15:36:25', owner: 'Anish Mahadaye' },
  { name: 'Binu Singh', createdOn: '2026-06-02T08:00:00', agentAssigned: '2026-06-02T10:23:00', noOfAttempts: 6, ownerUpdate: '2026-06-02 10:23:25', owner: 'Viraj Parsekar' },
  { name: 'Hitesh', createdOn: '2026-06-05T12:18:00', agentAssigned: '2026-06-05T12:33:00', noOfAttempts: 6, ownerUpdate: '2026-06-05 12:33:24', owner: 'Viraj Parsekar' },
  { name: 'K Jaichandra', createdOn: '2026-05-31T09:55:00', agentAssigned: '2026-06-01T10:27:00', noOfAttempts: 5, ownerUpdate: '2026-06-01 10:27:55', owner: 'Amar Singh' },
  { name: 'Gaurav Chaudhary', createdOn: '2026-06-02T03:03:00', agentAssigned: '2026-06-02T10:20:00', noOfAttempts: 5, ownerUpdate: '2026-06-02 10:20:27', owner: 'Faizan Shaikh' },
  { name: 'Pradeep', createdOn: '2026-06-07T20:51:00', agentAssigned: '2026-06-08T10:30:00', noOfAttempts: 5, ownerUpdate: '2026-06-08 10:30:57', owner: 'Anish Mahadaye' },
  { name: 'Raja', createdOn: '2026-06-03T15:54:00', agentAssigned: '2026-06-03T16:09:00', noOfAttempts: 5, ownerUpdate: '2026-06-03 16:09:19', owner: 'Amolraj Sinah' },
];

const FIRST = ['Rahul', 'Amit', 'Sneha', 'Vikram', 'Pooja', 'Suresh', 'Neha', 'Arjun', 'Divya', 'Manish', 'Kiran', 'Rohit', 'Anjali', 'Deepak', 'Meera'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Gupta', 'Singh', 'Joshi', 'Mehta', 'Rao'];

function fill(b, i) {
  const owner = OWNERS.find((o) => o.name === b.owner) || OWNERS[0];
  return {
    id: uuidv4(),
    name: b.name,
    status: b.status || STATUSES[i % STATUSES.length],
    stage: b.stage || STAGES[i % STAGES.length],
    type: b.type || 'Product Opportunity',
    diyFlag: b.diyFlag || (i % 2 === 0 ? 'Yes' : 'No'),
    upsale: b.upsale || (i % 3 === 0 ? 'Upsale' : 'New'),
    createdOn: b.createdOn,
    agentAssigned: b.agentAssigned,
    noOfAttempts: b.noOfAttempts || 1,
    noOfConnects: b.noOfConnects || Math.max(1, Math.floor((b.noOfAttempts || 1) / 2)),
    ownerUpdate: b.ownerUpdate,
    owner: owner.name,
    ownerEmail: owner.email,
    contactName: b.contactName || `${b.name} ${b.name.split(' ').slice(-1)[0]}`,
    phone: b.phone || `+91 9${String(800000000 + i * 137).slice(0, 9)}`,
    email: b.email || `${b.name.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
    company: b.company || 'Stoxkart',
    broadProduct: b.broadProduct || BROAD_PRODUCTS[i % BROAD_PRODUCTS.length],
    source: b.source || 'STX Trading Account',
    callStatus: b.callStatus || 'Ringing{DNP}',
    talismaId: b.talismaId || '--',
    opportunityId: b.opportunityId || String(16000000 + i * 1373),
  };
}

/**
 * Build the 40 seed opportunity rows (each with a fresh UUID id).
 * @returns {Array<Object>} Opp[] matching the frontend Opp interface.
 */
function buildSeedOpps() {
  const rows = BASE.map((b, i) => fill(b, i));
  for (let i = rows.length; i < 40; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const day = ((i * 3) % 27) + 1;
    const dd = String(day).padStart(2, '0');
    rows.push(
      fill(
        {
          name,
          createdOn: `2026-05-${dd}T09:${String((i * 7) % 60).padStart(2, '0')}:00`,
          agentAssigned: `2026-05-${dd}T11:${String((i * 5) % 60).padStart(2, '0')}:00`,
          noOfAttempts: ((i * 2) % 9) + 1,
          ownerUpdate: `2026-05-${dd} 11:${String((i * 5) % 60).padStart(2, '0')}:00`,
          owner: OWNERS[i % OWNERS.length].name,
        },
        i
      )
    );
  }
  return rows;
}

module.exports = {
  OWNERS, STATUSES, STAGES, BROAD_PRODUCTS, COMPANIES, TASK_TYPES, ACTIVITY_TYPES,
  getReferenceData, buildSeedOpps,
};
