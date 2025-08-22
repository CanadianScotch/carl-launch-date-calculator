const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}) => {
  console.log('=== SLACK BUTTON HANDLER ===');
  console.log('Full context received:', JSON.stringify(context, null, 2));
  
  try {
    // Slack sends the webhook data in different ways, let's check all possible locations
    let slackData = null;
    
    // Check various places where Slack might put the data
    if (context.body) {
      console.log('Found data in context.body');
      slackData = typeof context.body === 'string' ? JSON.parse(context.body) : context.body;
    } else if (context.parameters?.payload) {
      console.log('Found data in context.parameters.payload');
      slackData = typeof context.parameters.payload === 'string' ? JSON.parse(context.parameters.payload) : context.parameters.payload;
    } else if (context.payload) {
      console.log('Found data in context.payload');
      slackData = typeof context.payload === 'string' ? JSON.parse(context.payload) : context.payload;
    } else {
      console.log('Checking if entire context is the Slack data');
      slackData = context;
    }

    console.log('Parsed Slack data:', JSON.stringify(slackData, null, 2));

    // Validate we have Slack data
    if (!slackData || !slackData.actions) {
      return {
        success: false,
        error: 'No Slack actions found in payload',
        receivedData: slackData,
        contextKeys: Object.keys(context)
      };
    }

    const { user, actions, response_url } = slackData;
    const action = actions[0]; // Get the first action (button clicked)
    
    console.log('Action received:', action);
    console.log('Action value:', action.value);
    
    // Parse the action (expecting format like "approve_39542884170")
    const actionParts = action.value.split('_');
    const actionType = actionParts[0]; // "approve" or "deny"
    const dealId = actionParts[1]; // deal ID
    
    const managerName = user.name || user.real_name || user.username || 'Manager';
    
    console.log('Processing action:', actionType, 'for deal:', dealId, 'by:', managerName);

    // Initialize HubSpot client
    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN,
    });

    let updateValue;
    let responseMessage;

    if (actionType === 'approve') {
      updateValue = 'Approved with Override';
      responseMessage = `✅ *Override APPROVED* by ${managerName}`;
      
      // Update the deal property in HubSpot
      await hubspotClient.crm.deals.basicApi.update(dealId, {
        properties: {
          rld_override_approval: updateValue
        }
      });
      
      console.log('Deal approved and updated in HubSpot');
      
    } else if (actionType === 'deny') {
      // For deny, we keep the approval field empty
      responseMessage = `❌ *Override DENIED* by ${managerName}`;
      console.log('Override denied, keeping approval field empty');
    }

    // Create updated Slack message
    const updatedMessage = {
      text: `${actionType === 'approve' ? '✅' : '❌'} Override ${actionType === 'approve' ? 'Approved' : 'Denied'} - Deal #${dealId}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${actionType === 'approve' ? '✅' : '❌'} OVERRIDE ${actionType.toUpperCase()} - Deal Compliance`,
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${responseMessage}\n\n*Deal:* Deal #${dealId}\n*Decision made at:* ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: actionType === 'approve' 
              ? "✅ *Deal can now be closed won.* The sales rep has been notified."
              : "❌ *Deal closure remains blocked.* The sales rep should adjust dates or request a new override."
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Deal ID: ${dealId} | Manager: ${managerName}`
            }
          ]
        }
      ]
    };

    console.log('Updating Slack message...');

    // Update the original Slack message
    if (response_url) {
      const https = require('https');
      const url = require('url');
      
      const parsedUrl = url.parse(response_url);
      const postData = JSON.stringify({
        ...updatedMessage,
        replace_original: true
      });
      
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

      await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            console.log('Slack message updated successfully');
            resolve();
          });
        });

        req.on('error', (error) => {
          console.error('Error updating Slack message:', error);
          reject(error);
        });

        req.write(postData);
        req.end();
      });
    }

    console.log('Handler completed successfully');

    // Return success response to Slack
    return {
      success: true,
      action: actionType,
      dealId: dealId,
      manager: managerName,
      timestamp: new Date().toISOString(),
      message: `Override ${actionType} processed successfully`
    };

  } catch (error) {
    console.error('Error processing Slack button action:', error);
    console.error('Error stack:', error.stack);
    
    return {
      success: false,
      error: error.message,
      context: context,
      debugInfo: {
        hasAccessToken: !!process.env.PRIVATE_APP_ACCESS_TOKEN,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      }
    };
  }
};