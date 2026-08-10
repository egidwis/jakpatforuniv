import { supabase } from './supabase';

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'multiple_choice'
  | 'checkbox'
  | 'rating'
  | 'date'
  | 'page_break';

export type LogicOperator = 'equals' | 'not_equals' | 'contains' | 'is_answered' | 'is_empty';
export type LogicAction = 'show' | 'hide' | 'jump_to';
export type LogicMatchMode = 'ALL' | 'ANY'; // ALL = AND, ANY = OR

export interface LogicRule {
  id: string;
  sourceBlockId: string; // Pertanyaan acuan
  operator: LogicOperator;
  value?: string; // Nilai opsi atau teks pembanding
  action: LogicAction; // Aksi logic: show, hide, jump_to
  targetBlockId?: string; // Pertanyaan tujuan atau 'submit'
}

export interface QuestionBlock {
  id: string;
  type: QuestionType;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  minScale?: number;
  maxScale?: number;
  carryForwardFromBlockId?: string; // ID pertanyaan acuan untuk carry forward opsi
  logicMatchMode?: LogicMatchMode; // ALL (AND) atau ANY (OR)
  logicRules?: LogicRule[];
}

export interface CustomForm {
  id: string;
  user_id: string;
  slug?: string;
  title: string;
  description: string;
  schema: QuestionBlock[];
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  response_count?: number;
}

export interface CustomFormResponse {
  id: string;
  form_id: string;
  answers: Record<string, any>;
  created_at: string;
}

/**
 * Fetch all forms owned by a user
 */
export async function getUserCustomForms(userId: string): Promise<CustomForm[]> {
  const { data: forms, error } = await supabase
    .from('custom_forms')
    .select('*, custom_form_responses(count)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching user forms:', error);
    throw error;
  }

  return (forms || []).map((f: any) => ({
    ...f,
    schema: Array.isArray(f.schema) ? f.schema : [],
    response_count: f.custom_form_responses?.[0]?.count || 0
  }));
}

/**
 * Get form by ID
 */
export async function getCustomFormById(formId: string): Promise<CustomForm | null> {
  const { data, error } = await supabase
    .from('custom_forms')
    .select('*, custom_form_responses(count)')
    .eq('id', formId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching form by ID:', error);
    throw error;
  }

  return {
    ...data,
    schema: Array.isArray(data.schema) ? data.schema : [],
    response_count: data.custom_form_responses?.[0]?.count || 0
  };
}

/**
 * Get published form by username and slug/ID
 */
export async function getCustomFormBySlugOrId(usernameOrId: string, slug?: string): Promise<CustomForm | null> {
  if (slug) {
    // Lookup by username + slug
    // First get user_id from profiles where username = usernameOrId
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', usernameOrId.toLowerCase())
      .maybeSingle();

    if (!profile) return null;

    const { data: form, error } = await supabase
      .from('custom_forms')
      .select('*')
      .eq('user_id', profile.id)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (error || !form) return null;
    return {
      ...form,
      schema: Array.isArray(form.schema) ? form.schema : []
    };
  }

  // Fallback: direct ID lookup
  return getCustomFormById(usernameOrId);
}

/**
 * Create or update a custom form
 */
export async function saveCustomForm(
  formData: Partial<CustomForm>,
  userId: string
): Promise<CustomForm> {
  const payload = {
    user_id: userId,
    title: formData.title || 'Untitled Form',
    description: formData.description || '',
    slug: formData.slug || null,
    schema: formData.schema || [],
    status: formData.status || 'draft',
    updated_at: new Date().toISOString()
  };

  if (formData.id) {
    // Update
    const { data, error } = await supabase
      .from('custom_forms')
      .update(payload)
      .eq('id', formData.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating form:', error);
      throw error;
    }
    return data;
  } else {
    // Insert
    const { data, error } = await supabase
      .from('custom_forms')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating form:', error);
      throw error;
    }
    return data;
  }
}

/**
 * Delete a custom form by ID
 */
export async function deleteCustomForm(formId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('custom_forms')
    .delete()
    .eq('id', formId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting custom form:', error);
    throw error;
  }
}

/**
 * Submit form response
 */
export async function submitFormResponse(formId: string, answers: Record<string, any>): Promise<void> {
  const { error } = await supabase
    .from('custom_form_responses')
    .insert([{
      form_id: formId,
      answers
    }]);

  if (error) {
    console.error('Error submitting form response:', error);
    throw error;
  }
}

/**
 * Get all responses for a form
 */
export async function getFormResponses(formId: string): Promise<CustomFormResponse[]> {
  const { data, error } = await supabase
    .from('custom_form_responses')
    .select('*')
    .eq('form_id', formId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching form responses:', error);
    throw error;
  }

  return data || [];
}

/**
 * Export responses as CSV file download
 */
export function exportResponsesToCSV(
  formTitle: string,
  schema: QuestionBlock[],
  responses: CustomFormResponse[]
) {
  if (!responses.length) return;

  const headers = ['Submitted At', ...schema.map(q => `"${q.label.replace(/"/g, '""')}"`) ];

  const rows = responses.map(r => {
    const dateStr = new Date(r.created_at).toLocaleString('id-ID');
    const answerCols = schema.map(q => {
      const val = r.answers[q.id];
      if (val === undefined || val === null) return '""';
      if (Array.isArray(val)) return `"${val.join(', ').replace(/"/g, '""')}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    return [ `"${dateStr}"`, ...answerCols ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${formTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_responses.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
