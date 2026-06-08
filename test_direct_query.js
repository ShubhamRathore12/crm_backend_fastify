const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'public' } }
);

async function main() {
  console.log('Testing direct query...');
  const { data, error, count } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, phone', { count: 'exact' })
    .limit(5);
  
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Count:', count);
}

main().catch(console.error);
