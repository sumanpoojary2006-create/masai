const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
  const { data: curriculums } = await supabase.from('batch_curriculums').select('batch_name');
  console.log("Curriculum Batches:", [...new Set((curriculums || []).map(c => c.batch_name))]);
}
check();
