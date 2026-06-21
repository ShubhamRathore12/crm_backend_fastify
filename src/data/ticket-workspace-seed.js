'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Dummy data for the Interactions / Tickets workspace.
// Mirrors the front-end shape (lib/mock/interactions.ts) so the API can serve
// the same rich objects: omni-channel tickets, threaded conversations,
// Customer 360, bank Account Information and Fast Lane flow metadata.
// ─────────────────────────────────────────────────────────────────────────────

const AGENTS = [
  { id: 'a1', name: 'Ankit Tiwari', avatarColor: 'bg-indigo-500', available: true },
  { id: 'a2', name: 'Siddhant Raj', avatarColor: 'bg-emerald-500', available: true },
  { id: 'a3', name: 'Sarah Khan', avatarColor: 'bg-rose-500', available: false },
  { id: 'a4', name: 'Rohan Shah', avatarColor: 'bg-amber-500', available: true },
  { id: 'a5', name: 'Aman Pandey', avatarColor: 'bg-cyan-500', available: true },
];

function bankAccount(p) {
  return {
    accountNumberMasked: '****************' + p.accountNo,
    bankName: 'ICICI', accountType: 'Savings', status: 'Active', branch: 'Bengaluru',
    ifsc: 'ICIC0002338', beneficiary: 'Radhika', beneficiaryRelationship: 'Mother',
    beneficiaryPan: 'FP3R****CX', accountOpeningDate: '2024-03-10',
    lastUsedNetBanking: '2024-03-12', lastUsedMobileApp: '2024-03-15',
    debitCardNumber: '*** ***4 674', debitCardLastUsed: '2024-03-11', balance: '₹2,45,300',
    ...p,
  };
}

const STANDARD_360 = {
  currentProducts: [
    { group: 'Loans', name: 'Standard Home Loan', detail: ['Loan Amount: Rs. 30,00,000 (30 lakhs)', 'Interest Rate: 6.75%', 'Loan Term: 20 years'] },
    { group: 'Loans', name: 'Premium Vehicle Loan', detail: ['Loan Amount: Rs. 15,00,000 (15 lakhs)', 'Interest Rate: 8.50%', 'Loan Term: 5 years'] },
    { group: 'Cards', name: 'Platinum Credit Card', detail: ['Credit Limit: Rs. 5,00,000 (5 lakhs)', 'Annual Fee: Rs. 3,000'] },
    { group: 'Cards', name: 'Standard Debit Card', detail: ['Interest Rate: Rs. 5,00,000 (5 lakhs)', 'Fees and Charges: Rs. 500 per year'] },
    { group: 'Deposits', name: 'Fixed Deposits', detail: ['Deposit Amount: Rs. 1,00,000 (1 lakh)', 'Interest Rate: 6.00%', 'Tenure: 3 years'] },
    { group: 'Loans', name: 'Personal Loan', detail: ['Loan Amount: Rs. 20,00,000 (20 lakhs)', 'Interest Rate: 12.00%', 'Loan Term: 3 years'] },
  ],
  upsell: [
    { group: 'Loans', name: 'Premium Home Loan', detail: ['Interest Rate - 6.5%'] },
    { group: 'Loans', name: 'Advanced Vehicle Loan', detail: ['Interest Rate - 5.5%'] },
    { group: 'Cards', name: 'Titanium Credit Card', detail: ['Total Limit - Rs. 10 Lakhs'] },
    { group: 'Cards', name: 'Premium Debit Card', detail: ['Monthly Spend Limit - Rs. 8 Lakhs'] },
    { group: 'Insurance', name: 'Life Insurance', detail: ['Interest Rate: 7%'] },
    { group: 'Insurance', name: 'Health Insurance', detail: ['Interest Rate: 6%'] },
  ],
  professional: [
    { label: 'Highest Educational Qualification', value: 'Master of Business Administration' },
    { label: 'Current Employer', value: 'Infosys Ltd.' },
    { label: 'Designation', value: 'Senior Project Manager' },
    { label: 'Annual Income', value: '₹24,00,000' },
  ],
  journey: [
    { label: 'Credit Card Application', timestamp: '2025-07-19 20:10', channel: 'email' },
    { label: 'KYC Verified', timestamp: '2025-07-20 11:32' },
    { label: 'Home Loan Disbursed', timestamp: '2025-08-02 16:05' },
    { label: 'Raised Support Ticket — Order tracking', timestamp: '2025-06-19 16:30', channel: 'email' },
  ],
  lifetimeValue: '₹68,40,000', riskScore: 'Low', csat: 92, npsSegment: 'Promoter',
};

const TICKETS = [
  {
    id: 't1', ticketNo: '6718341581927', subject: 'Issue with order tracking',
    preview: 'Hi, I placed an order last week but the tracking link shows no movement…',
    channel: 'email', status: 'pending', subStatus: 'Pending from Operations', priority: 'low',
    customer: { name: 'Rajeev Enterprises', email: 'rajeev@enterprises.com', emailMasked: '******n@pintu.co.id', phone: '+919818682292', phoneMasked: '******2292', location: 'Karnataka', customerCode: '+919818682292', classification: 'Gold', avatarColor: 'bg-blue-500' },
    assignedTo: AGENTS[0], createdAt: '2025-06-19T16:30:00+05:30', updatedAt: '2025-06-19T16:30:00+05:30', slaDueAt: '2025-06-20T16:30:00+05:30',
    firstResponseMins: 124, tags: ['order', 'logistics'], unread: true,
    aiSummary: 'Customer reports stalled order tracking for an order placed last week. Awaiting Operations update on shipment status. Sentiment slightly frustrated but cooperative.',
    sentiment: 'neutral',
    messages: [
      { id: 'm1', direction: 'inbound', author: 'Ghilman Riyadhi', authorEmail: '******n@pintu.co.id', channel: 'email', timestamp: '2025-06-07T10:12:00+05:30', body: 'Hi Team,\n\nI placed an order (#PO-77123) last week but the tracking link shows no movement for 4 days. Could you please check the status and let me know the expected delivery date?\n\nRegards,\nGhilman', attachments: [{ name: 'order-receipt.pdf', size: '84 KB', type: 'pdf' }] },
      { id: 'm2', direction: 'outbound', author: 'Ankit Tiwari', channel: 'email', timestamp: '2025-06-07T12:16:00+05:30', body: "Hi Ghilman,\n\nThanks for reaching out. I've escalated this to our Operations team and will update you with the shipment status within 24 hours.\n\nBest,\nAnkit" },
      { id: 'm3', direction: 'inbound', author: 'Ghilman Riyadhi', authorEmail: '******ebank@gmail.com', channel: 'email', timestamp: '2025-06-07T13:40:00+05:30', body: "Thank you, appreciate the quick response. Please prioritise as it's a gift for an event this weekend." },
    ],
    accounts: [bankAccount({ accountNo: '4506' }), bankAccount({ accountNo: '4598', balance: '₹89,120' })],
    customer360: STANDARD_360,
  },
  {
    id: 't2', ticketNo: '6718341580203', subject: 'Issue with order tracking',
    preview: 'Order not delivered yet, raised 3 days ago…',
    channel: 'email', status: 'pending', subStatus: 'Pending from Operations', priority: 'low',
    customer: { name: 'Kartik Suri', email: 'kartik.suri@gmail.com', emailMasked: '******pintu.co.id', phone: '+919811170020', phoneMasked: '******1170', location: 'Delhi', customerCode: '+919811170020', classification: 'Silver', avatarColor: 'bg-orange-500' },
    assignedTo: AGENTS[3], createdAt: '2025-06-05T16:30:00+05:30', updatedAt: '2025-06-19T16:30:00+05:30', slaDueAt: '2025-06-21T16:30:00+05:30',
    firstResponseMins: 56, tags: ['order'], unread: false,
    aiSummary: 'Repeat follow-up on a delayed delivery. Customer patience wearing thin; recommend proactive courier update.',
    sentiment: 'neutral',
    messages: [
      { id: 'm1', direction: 'inbound', author: 'Kartik Suri', authorEmail: '******pintu.co.id', channel: 'email', timestamp: '2025-06-05T09:00:00+05:30', body: "My order still hasn't arrived. It's been 3 days past the promised date. Please advise." },
    ],
    accounts: [bankAccount({ accountNo: '7781', bankName: 'HDFC', branch: 'New Delhi', balance: '₹1,12,400' })],
    customer360: STANDARD_360,
  },
  {
    id: 't3', ticketNo: '750323230608', subject: 'Inbound Call — Account balance enquiry',
    preview: 'Customer called regarding account balance and recent debit…',
    channel: 'call', status: 'pending', subStatus: 'Unanswered', priority: 'low',
    customer: { name: 'Preeti Sahni', email: 'preeti.sahni@kapture.cx', emailMasked: '******.sahni@kapture.cx', phone: '+919818682292', phoneMasked: '******2292', location: 'Haryana, 122002', customerCode: '+919818682292', classification: 'Platinum', avatarColor: 'bg-rose-500' },
    assignedTo: AGENTS[0], createdAt: '2025-06-19T14:23:00+05:30', updatedAt: '2025-06-19T14:27:00+05:30', slaDueAt: '2025-06-19T18:23:00+05:30',
    firstResponseMins: null, tags: ['call', 'balance'], unread: false,
    aiSummary: 'Missed inbound call. Customer is a Platinum segment holder — recommend callback within SLA. Likely balance/transaction query based on IVR path.',
    sentiment: 'neutral',
    messages: [
      { id: 'm1', direction: 'inbound', author: 'Preeti Sahni', channel: 'call', timestamp: '2025-06-19T14:23:00+05:30', body: 'Inbound call received.', call: { type: 'Inbound', from: '******2292', to: '918046107210', duration: '00:00', status: 'Unanswered' } },
    ],
    accounts: [bankAccount({ accountNo: '4506' }), bankAccount({ accountNo: '9921', bankName: 'Axis', balance: '₹4,02,990' })],
    customer360: STANDARD_360,
  },
  {
    id: 't4', ticketNo: '7720418735930', subject: 'WhatsApp — Laptop delivered but damaged',
    preview: 'नमस्कार, मुझे कल अपने लैपटॉप की डिलीवरी मिली, लेकिन दुर्भाग्यवश…',
    channel: 'whatsapp', status: 'open', subStatus: 'Awaiting Customer', priority: 'medium',
    customer: { name: 'Jayantika Biswas', email: 'jayantika.b@gmail.com', emailMasked: '******a.b@gmail.com', phone: '+917720418735', phoneMasked: '******8735', location: 'West Bengal', customerCode: '+917720418735', classification: 'Silver', avatarColor: 'bg-emerald-500' },
    assignedTo: AGENTS[4], createdAt: '2025-06-19T16:24:00+05:30', updatedAt: '2025-06-19T16:24:00+05:30', slaDueAt: '2025-06-20T10:24:00+05:30',
    firstResponseMins: 12, tags: ['whatsapp', 'damaged', 'returns'], unread: true,
    aiSummary: 'Customer received a damaged laptop and wants a replacement. Photos attached. Eligible for replacement under 7-day policy — initiate reverse pickup.',
    sentiment: 'negative',
    messages: [
      { id: 'm1', direction: 'inbound', author: 'Jayantika Biswas', channel: 'whatsapp', timestamp: '2025-06-19T15:50:00+05:30', body: 'नमस्कार, मुझे कल अपने लैपटॉप की डिलीवरी मिली, लेकिन दुर्भाग्यवश स्क्रीन टूटी हुई है। कृपया replacement की प्रक्रिया बताएं।', attachments: [{ name: 'damage-1.jpg', size: '1.2 MB', type: 'image' }, { name: 'damage-2.jpg', size: '980 KB', type: 'image' }] },
      { id: 'm2', direction: 'outbound', author: 'Aman Pandey', channel: 'whatsapp', timestamp: '2025-06-19T16:02:00+05:30', body: 'नमस्ते Jayantika, हमें खेद है। हम तुरंत replacement शुरू कर रहे हैं। कृपया reverse pickup के लिए पता confirm करें।' },
    ],
    accounts: [bankAccount({ accountNo: '3310', bankName: 'SBI', branch: 'Kolkata', balance: '₹37,650' })],
    customer360: STANDARD_360,
  },
  {
    id: 't5', ticketNo: '4750311003294', subject: 'WhatsApp — Instant loan enquiry',
    preview: 'Hi, would like to know about instant personal loan options…',
    channel: 'whatsapp', status: 'open', subStatus: 'Customer Responded', priority: 'low',
    customer: { name: 'Vikas Swamy', email: 'vikas.swamy@gmail.com', emailMasked: '******swamy@gmail.com', phone: '+919911170020', phoneMasked: '******1170', location: 'Haryana', customerCode: '+919911170020', classification: 'Bronze', avatarColor: 'bg-violet-500' },
    assignedTo: null, createdAt: '2025-06-19T13:55:00+05:30', updatedAt: '2025-06-19T13:55:00+05:30', slaDueAt: '2025-06-20T13:55:00+05:30',
    firstResponseMins: null, tags: ['loan', 'sales'], unread: true,
    aiSummary: 'Inbound lead asking about instant personal loans. Pre-qualified for up to ₹5L based on profile. Route to Sales for cross-sell.',
    sentiment: 'positive',
    messages: [
      { id: 'm1', direction: 'inbound', author: 'Vikas Swamy', channel: 'whatsapp', timestamp: '2025-06-19T13:55:00+05:30', body: 'Hi, would like to know about instant loan options and eligibility.' },
    ],
    accounts: [bankAccount({ accountNo: '8855', bankName: 'Kotak', branch: 'Gurugram', balance: '₹14,200' })],
    customer360: STANDARD_360,
  },
  {
    id: 't6', ticketNo: '4750321539331', subject: 'Facebook — Refund not received',
    preview: 'Raised a refund 10 days ago, still not credited to my account…',
    channel: 'facebook', status: 'escalated', subStatus: 'Escalated to L2', priority: 'high',
    customer: { name: 'Pritesh Mehta', email: 'pritesh.m@gmail.com', emailMasked: '******.m@gmail.com', phone: '+919812345670', phoneMasked: '******5670', location: 'Gujarat', customerCode: '+919812345670', classification: 'Gold', avatarColor: 'bg-sky-500' },
    assignedTo: AGENTS[1], createdAt: '2025-06-19T13:40:00+05:30', updatedAt: '2025-06-19T13:40:00+05:30', slaDueAt: '2025-06-19T15:40:00+05:30',
    firstResponseMins: 8, tags: ['refund', 'escalation'], unread: false,
    aiSummary: 'Refund delayed beyond 7-day SLA. Customer frustrated, threatening social escalation. Verify refund reference and expedite via Finance.',
    sentiment: 'negative',
    messages: [
      { id: 'm1', direction: 'inbound', author: 'Pritesh Mehta', channel: 'facebook', timestamp: '2025-06-19T13:30:00+05:30', body: "It's been 10 days and my refund (REF-99812) is still not credited. This is unacceptable." },
    ],
    accounts: [bankAccount({ accountNo: '6620', bankName: 'ICICI', branch: 'Ahmedabad', balance: '₹2,01,500' })],
    customer360: STANDARD_360,
  },
];

module.exports = { TICKETS, AGENTS, STANDARD_360, bankAccount };
