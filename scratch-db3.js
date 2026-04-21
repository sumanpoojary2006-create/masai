const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
  const { data: curriculums } = await supabase.from('batch_curriculums').select('user_id, batch_name');
  const { data: lectures } = await supabase.from('lectures').select('user_id, batch_name').or('learning_objective.is.null,learning_objective.eq.');
  console.log("Curriculum user:", curriculums?.[0]?.user_id);
  console.log("Lecture user:", lectures?.[0]?.user_id);
}
check();
