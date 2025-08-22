exports.main = async (context = {}) => {
  console.log('=== SENDING REAL SLACK MESSAGE ===');
  
  try {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    console.log('Webhook URL exists:', !!slackWebhookUrl);
    
    if (!slackWebhookUrl) {
      return { success: false, error: 'No webhook URL' };
    }
    
    const { 
      dealId, 
      dealName, 
      seatCount,
      closeDate, 
      currentRLD, 
      suggestedRLD,
      violations,
      repName,
      repEmail,
      companyName 
    } = context.parameters;

    console.log('=== UPDATING DEAL PROPERTIES ===');
    console.log('Deal ID:', dealId);
    console.log('Rep Name:', repName);
    console.log('Rep Email:', repEmail);

    // STEP 1: Update deal properties to set pending approval state
    const hubspot = require('@hubspot/api-client');
    const hubspotClient = new hubspot.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

    // Get current date for request tracking
    const requestDate = new Date().toISOString().split('T')[0];
    const requestedBy = `${repName} (${repEmail})`;

    // Update multiple properties to set the pending approval state
    const propertiesToUpdate = {
      override_request_status: "pending",
      override_requested_by: requestedBy,
      override_request_date: requestDate,
      override_approved_by: "", // Clear any previous approval
      override_approval_date: ""
    };

    console.log('Properties to update:', propertiesToUpdate);

    try {
      // Update all the properties
      for (const [property, value] of Object.entries(propertiesToUpdate)) {
        await hubspotClient.crm.deals.basicApi.update(dealId, {
          properties: {
            [property]: value
          }
        });
        console.log(`✅ Updated ${property} to: ${value}`);
      }
    } catch (hubspotError) {
      console.error('❌ Error updating HubSpot properties:', hubspotError);
      // Continue with Slack notification even if property update fails
    }

    // STEP 2: Format dates nicely for Slack
    const formatDate = (dateString) => {
      if (!dateString) return "Not set";
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
      });
    };

    const violationText = violations ? violations.join(", ") : "Multiple violations";

    // STEP 3: Create the Block Kit message WITHOUT interactive buttons
    const slackMessage = {
      text: `🆘 Override Request - ${dealName || 'Deal'} requires approval`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🆘 OVERRIDE REQUEST - Deal Compliance",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📋 Deal:* ${dealName || 'Unknown Deal'}`
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn", 
              text: `*💰 Seats:* ${seatCount || 'Unknown'}`
            },
            {
              type: "mrkdwn",
              text: `*👤 Rep:* ${repName || 'Unknown Rep'}`
            }
          ]
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*📅 Close Date:* ${formatDate(closeDate)}`
            },
            {
              type: "mrkdwn",
              text: `*🚨 Violation:* ${violationText}`
            },
            {
              type: "mrkdwn",
              text: `*📍 Current RLD:* ${formatDate(currentRLD)}`
            },
            {
              type: "mrkdwn",
              text: `*💡 Suggested RLD:* ${formatDate(suggestedRLD)}`
            }
          ]
        },
        {
          type: "divider"
        },
        // Status update section
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⚠️ *Action Required:* Please review and approve this override request in HubSpot.\n\n*Status:* ⏳ Pending Approval\n*Requested by:* ${requestedBy}\n*Request date:* ${formatDate(requestDate)}`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "🔗 View Deal in HubSpot",
                emoji: true
              },
              url: `https://app.hubspot.com/contacts/23384537/deal/${dealId}`,
              action_id: "view_deal_button"
            }
          ]
        }
      ]
    };

    console.log('About to send message to Slack...');

    // STEP 4: Send to Slack using Node.js https
    const https = require('https');
    const url = require('url');
    
    const parsedUrl = url.parse(slackWebhookUrl);
    const postData = JSON.stringify(slackMessage);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: body
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });

    console.log('Slack response:', response);

    if (response.statusCode === 200) {
      return {
        success: true,
        dealId: dealId,
        message: 'Override request sent to Slack - approval required in HubSpot!',
        propertiesUpdated: Object.keys(propertiesToUpdate),
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Slack API error: ${response.statusCode} - ${response.body}`);
    }

  } catch (error) {
    console.error('Error sending to Slack:', error);
    
    return {
      success: false,
      error: error.message,
      dealId: context.parameters?.dealId,
      timestamp: new Date().toISOString()
    };
  }
};