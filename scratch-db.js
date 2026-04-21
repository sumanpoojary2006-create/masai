const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
  const { data: curriculums } = await supabase.from('batch_curriculums').select('batch_name, count(*) as c');
  console.log("Curriculums:", curriculums);
  
  const { data: lectures } = await supabase.from('lectures').select('batch_name').or('learning_objective.is.null,learning_objective.eq.');
  console.log("Lectures missing LOs batches:", [...new Set(lectures.map(l => l.batch_name))]);
}
check();
