// Cloudflare Function untuk webhook Mayar
// Menerima notifikasi pembayaran dari Mayar dan memperbarui status di database

export async function onRequest(context) {
  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    });
  }



  try {
    // Parse request body
    const requestData = await context.request.json();
    const event = requestData.event || '';

    console.log('Webhook received:', JSON.stringify(requestData));

    // Validasi webhook token jika ada
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;
    const requestToken = context.request.headers.get('X-Webhook-Token');

    // Only validate token if both webhookToken is configured AND requestToken is provided
    if (webhookToken && requestToken && requestToken !== webhookToken) {
      console.error('Invalid webhook token');
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid webhook token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ignore payment.created and payment.reminder events
    if (event === 'payment.created' || event === 'payment.reminder') {
      console.log(`Ignoring event: ${event}`);
      return new Response(JSON.stringify({
        success: true,
        message: `Event ${event} ignored`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ekstrak data pembayaran dari webhook
    // Format webhook Mayar bisa bervariasi, jadi kita perlu menangani beberapa kemungkinan

    let paymentId = '';
    let status = '';
    // event already declared above

    // Format 1: Mayar standard format dengan event dan data
    if (requestData.data && requestData.data.id) {
      paymentId = requestData.data.id;
      status = requestData.data.status || '';
    }
    // Format 1a: Mayar standard format dengan event dan data.transactionId (Paylater/Generic)
    else if (requestData.data && requestData.data.transactionId) {
      paymentId = requestData.data.transactionId;
      status = requestData.data.status || '';
    }
    // Format 2: id dan status langsung di root
    else if (requestData.id) {
      paymentId = requestData.id;
      status = requestData.status || '';
    }
    // Format 3: transaction_id dan status
    else if (requestData.transaction_id) {
      paymentId = requestData.transaction_id;
      status = requestData.status || '';
    }

    if (!paymentId) {
      console.error('Payment ID not found in webhook data');
      return new Response(JSON.stringify({
        success: false,
        message: 'Payment ID not found in webhook data'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`Webhook event: ${event}, Payment ID: ${paymentId}, Status: ${status}`);

    // Map status Mayar ke status aplikasi
    let appStatus = 'pending';

    // Mayar menggunakan SUCCESS untuk pembayaran berhasil
    if (status === 'SUCCESS' || status === 'PAID' || status === 'paid' || status === 'COMPLETED' || status === 'completed') {
      appStatus = 'completed';
    } else if (status === 'FAILED' || status === 'failed' || status === 'EXPIRED' || status === 'expired') {
      appStatus = 'failed';
    } else if (status === 'PENDING' || status === 'pending') {
      appStatus = 'pending';
    }

    console.log(`Payment ${paymentId} status updated to ${appStatus}`);

    // Jika ini adalah event testing dari Mayar, return success tanpa update database
    if (event === 'testing') {
      console.log('This is a testing webhook event, skipping database update');
      return new Response(JSON.stringify({
        success: true,
        message: 'Test webhook received successfully',
        paymentId,
        status: appStatus,
        note: 'This was a test event, no database update performed'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update status di database Supabase
    try {
      const supabaseUrl = context.env.VITE_SUPABASE_URL;
      const supabaseKey = context.env.VITE_SUPABASE_ANON_KEY;

      // Supabase configuration loaded successfully

      if (!supabaseUrl || !supabaseKey) {
        console.error('Supabase credentials not found in environment');
        return new Response(JSON.stringify({
          success: false,
          message: 'Database configuration error',
          paymentId,
          status: appStatus
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Update transaction status
        const transactionUrl = `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${paymentId}`;
        console.log('Querying Supabase:', transactionUrl);
        console.log('Looking for payment_id:', paymentId);

        const updateTransactionResponse = await fetch(
          transactionUrl,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({ status: appStatus })
          }
        );

        const updatedTransactions = await updateTransactionResponse.json();
        console.log('Supabase response status:', updateTransactionResponse.status);
        console.log('Updated transactions:', updatedTransactions);

        // Check if transaction was found
        if (!updatedTransactions || updatedTransactions.length === 0) {
          console.warn(`No transaction found with payment_id: ${paymentId}. Trying fallback lookup.`);

          // Fallback: Try to find by email and amount if available
          const customerEmail = requestData.data ? requestData.data.customerEmail : null;
          const amount = requestData.data ? requestData.data.amount : null;

          if (customerEmail && amount) {
            console.log(`Fallback: Looking up by email ${customerEmail} and amount ${amount}`);
            // Find form submission by email
            const formUrl = `${supabaseUrl}/rest/v1/form_submissions?email=eq.${customerEmail}&order=created_at.desc&limit=1`;
            const formResponse = await fetch(formUrl, {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              }
            });
            const forms = await formResponse.json();

            if (forms && forms.length > 0) {
              const form = forms[0];
              // Check if amount matches roughly (allow some variance if needed, but exact is better)
              if (Math.abs(form.total_cost - amount) < 1000) {
                console.log(`Fallback: Found matching form submission ${form.id}. Updating status.`);
                // Update the form directly since we missed the transaction
                const updateFormFallbackResponse = await fetch(
                  `${supabaseUrl}/rest/v1/form_submissions?id=eq.${form.id}`,
                  {
                    method: 'PATCH',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json',
                      'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                      payment_status: appStatus === 'completed' ? 'paid' : appStatus,
                      status: appStatus === 'completed' ? 'process' : undefined
                    })
                  }
                );

                // Also try to update transaction if it exists by form_id
                const updateTransFallbackResponse = await fetch(
                  `${supabaseUrl}/rest/v1/transactions?form_submission_id=eq.${form.id}`,
                  {
                    method: 'PATCH',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status: appStatus, payment_id: paymentId }) // Update payment_id too!
                  }
                );

                return new Response(JSON.stringify({
                  success: true,
                  message: 'Fallback update successful',
                  paymentId,
                  status: appStatus
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
            }
          }

          return new Response(JSON.stringify({
            success: false,
            message: 'Transaction not found in database',
            paymentId,
            status: appStatus,
            note: 'The payment_id from webhook does not match any transaction in our database'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Get form_submission_id from transaction
        if (updatedTransactions && updatedTransactions.length > 0) {
          const formSubmissionId = updatedTransactions[0].form_submission_id;

          // Update form submission payment status
          const updateFormResponse = await fetch(
            `${supabaseUrl}/rest/v1/form_submissions?id=eq.${formSubmissionId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                payment_status: appStatus === 'completed' ? 'paid' : appStatus,
                status: appStatus === 'completed' ? 'process' : undefined
              })
            }
          );

          const updatedForms = await updateFormResponse.json();
          console.log('Updated form submissions:', updatedForms);

          // Update invoice status if this is a manual invoice
          const updateInvoiceResponse = await fetch(
            `${supabaseUrl}/rest/v1/invoices?payment_id=eq.${paymentId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                status: appStatus === 'completed' ? 'paid' : appStatus,
                paid_at: appStatus === 'completed' ? new Date().toISOString() : null
              })
            }
          );

          const updatedInvoices = await updateInvoiceResponse.json();
          console.log('Updated invoices:', updatedInvoices);
        }
      }
    } catch (dbError) {
      console.error('Error updating database:', dbError);
      // Continue even if database update fails
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook received and processed successfully',
      paymentId,
      status: appStatus
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error processing webhook: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
