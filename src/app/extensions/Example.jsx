import React, { useState, useEffect } from "react";
import {
  Text,
  Flex,
  Tag,
  Button,
  Input,
  LoadingSpinner,
  hubspot,
} from "@hubspot/ui-extensions";

// Define the extension to be run within the Hubspot CRM
hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <Extension
    context={context}
    runServerless={runServerlessFunction}
    sendAlert={actions.addAlert}
  />
));

// US Federal Holidays for 2024-2026 (expand as needed)
const FEDERAL_HOLIDAYS = [
  // 2024
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-05-27', '2024-06-19', 
  '2024-07-04', '2024-09-02', '2024-10-14', '2024-11-11', '2024-11-28', '2024-12-25',
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19', 
  '2025-07-04', '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25', // FIXED: Columbus Day is Oct 13
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', 
  '2026-07-04', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
];

// Helper function to get the primary violation (highest priority)
const getPrimaryViolation = (violations) => {
  const nonCompliantViolations = violations.filter(v => v.type !== "compliant");
  if (nonCompliantViolations.length === 0) {
    return "compliant";
  }
  // Return the highest priority (lowest number) violation
  return nonCompliantViolations[0].type;
};

// Helper function to update multiple deal properties at once
const updateDealProperties = async (runServerless, dealId, properties) => {
  const results = [];
  
  for (const [property, value] of Object.entries(properties)) {
    try {
      const result = await runServerless({
        name: "updateDealProperty",
        parameters: {
          dealId: dealId,
          property: property,
          value: value
        }
      });
      results.push({ property, success: true, result });
    } catch (err) {
      results.push({ property, success: false, error: err.message });
    }
  }
  
  return results;
};
const checkApprovalPermission = (user) => {
  console.log('Checking permissions for user:', user);
  
  // OPTION 1: Specific Super Admin user IDs (most reliable)
  const superAdminUserIds = [
    60990003, // Matthew Ruxton (🦁 Matthew)
    // Add other super admin user IDs here as needed
  ];
  
  if (superAdminUserIds.includes(user.id)) {
    console.log('✅ User is in Super Admin list - granting approval permission');
    return true;
  }
  
  // OPTION 2: Allowed teams (Revenue + IT/Systems for super admins)
  const allowedTeams = [
    "Revenue",
    "IT, Systems & Compliance" // Your current team
  ];
  
  // Check if user is in any allowed team
  if (user.teams && Array.isArray(user.teams)) {
    const isInAllowedTeam = user.teams.some(team => 
      allowedTeams.includes(team.name)
    );
    
    console.log('Teams check:', user.teams.map(t => t.name), 'Allowed team found:', isInAllowedTeam);
    
    if (isInAllowedTeam) {
      console.log('✅ User is in allowed team - granting approval permission');
      return true;
    }
  }
  
  console.log('❌ User does not have approval permission');
  return false;
};

// Helper function to check if a date is a federal holiday
const isFederalHoliday = (date) => {
  const dateString = date.toISOString().split('T')[0];
  return FEDERAL_HOLIDAYS.includes(dateString);
};

// Helper function to safely parse dates (avoiding timezone issues)
const parseDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  
  if (dateString.includes('T')) {
    return new Date(dateString.split('T')[0] + 'T12:00:00');
  } else if (dateString.includes('-')) {
    return new Date(dateString + 'T12:00:00');
  } else {
    const date = new Date(dateString);
    date.setHours(12, 0, 0, 0);
    return date;
  }
};

// Helper function to calculate the perfect RLD
const calculatePerfectRLD = (closeDate, currentRLD) => {
  if (!closeDate) return null;
  
  const close = parseDate(closeDate);
  const current = currentRLD ? parseDate(currentRLD) : null;
  
  // OPTION B: Find the Monday that's closest to 4 weeks out (but at least 4 weeks)
  const fourWeeksOut = new Date(close);
  fourWeeksOut.setDate(close.getDate() + 28); // Exactly 4 weeks
  
  // Find the Monday on or after the 4-week mark
  let targetDate = new Date(fourWeeksOut);
  
  // If 4 weeks out is Monday or later in the week, find next Monday
  // If 4 weeks out is Sunday or earlier, find the Monday of that week
  const dayOfWeek = targetDate.getDay();
  
  if (dayOfWeek === 0) { // Sunday - next day is Monday
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (dayOfWeek === 1) { // Monday - perfect, use this Monday
    // Keep as is
  } else { // Tuesday-Saturday - find next Monday
    const daysToNextMonday = 8 - dayOfWeek; // Days until next Monday
    targetDate.setDate(targetDate.getDate() + daysToNextMonday);
  }
  
  // Handle holidays - if Monday is a holiday, move to Tuesday
  while (isFederalHoliday(targetDate)) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  
  // If we have a current RLD and it's compliant with timing, just fix the day
  if (current) {
    const minimumDate = new Date(close);
    minimumDate.setDate(close.getDate() + 28); // 4 weeks minimum
    
    if (current >= minimumDate) {
      // Current RLD timing is good, just fix to proper day
      let adjustedCurrent = new Date(current);
      const currentDay = adjustedCurrent.getDay();
      
      if (currentDay === 1) { // Monday
        if (!isFederalHoliday(adjustedCurrent)) {
          return adjustedCurrent; // Perfect as-is
        } else {
          adjustedCurrent.setDate(adjustedCurrent.getDate() + 1); // Move to Tuesday
          return adjustedCurrent;
        }
      } else if (currentDay === 2) { // Tuesday
        // Check if Monday before was a holiday
        const mondayBefore = new Date(adjustedCurrent);
        mondayBefore.setDate(adjustedCurrent.getDate() - 1);
        if (isFederalHoliday(mondayBefore)) {
          return adjustedCurrent; // Tuesday is correct due to holiday
        } else {
          // Move back to Monday
          return mondayBefore;
        }
      } else {
        // Wrong day, use our calculated target
        return targetDate;
      }
    }
  }
  
  return targetDate;
};

// Helper function to check all compliance rules
const calculateAllCompliance = (closeDate, rldDate, isClosed, pipeline) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const violations = [];
  
  // Check if this is an Expansions pipeline deal
  const isExpansionsPipeline = pipeline === "782785325"; 
  
  // Rule 1: Close Date in past (highest priority) - ALWAYS enforced
  if (closeDate) {
    const close = parseDate(closeDate);
    close.setHours(0, 0, 0, 0);
    
    if (close < today && isClosed !== "true" && isClosed !== true) {
      violations.push({
        priority: 1,
        type: "close_date_past",
        message: "Close Date is overdue",
        severity: "error"
      });
    }
  }
  
  // Rule 2: RLD in past (high priority) - ALWAYS enforced
  if (rldDate) {
    const rld = parseDate(rldDate);
    rld.setHours(0, 0, 0, 0);
    
    if (rld < today) {
      violations.push({
        priority: 2,
        type: "rld_past",
        message: "RLD is in the past",
        severity: "error"
      });
    }
  }
  
  // Rules 3 & 4: RLD timing requirements - SKIP for Expansions pipeline
  if (!isExpansionsPipeline && closeDate && rldDate) {
    const close = parseDate(closeDate);
    const rld = parseDate(rldDate);
    
    const minimumRLD = new Date(close);
    minimumRLD.setDate(close.getDate() + 28); // 4 weeks minimum

    if (rld < close) {
      violations.push({
        priority: 3,
        type: "rld_before_close",
        message: "RLD before Close Date",
        severity: "error"
      });
    } else if (rld < minimumRLD) {
      violations.push({
        priority: 4,
        type: "rld_too_soon",
        message: "RLD too soon (less than 4 weeks)",
        severity: "warning"
      });
    }
  }
  
  // Rule 5: RLD not on correct day - SKIP for Expansions pipeline
  if (!isExpansionsPipeline && rldDate) {
    const rld = parseDate(rldDate);
    const dayOfWeek = rld.getDay();
    const isMonday = dayOfWeek === 1;
    const isTuesday = dayOfWeek === 2;
    
    if (isMonday) {
      if (isFederalHoliday(rld)) {
        violations.push({
          priority: 5,
          type: "rld_holiday",
          message: "RLD is on a federal holiday",
          severity: "warning"
        });
      }
    } else if (isTuesday) {
      const mondayBefore = new Date(rld);
      mondayBefore.setDate(rld.getDate() - 1);
      
      if (!isFederalHoliday(mondayBefore)) {
        violations.push({
          priority: 5,
          type: "rld_wrong_day",
          message: "RLD should be Monday (Tuesday only if Monday is holiday)",
          severity: "warning"
        });
      }
    } else {
      violations.push({
        priority: 5,
        type: "rld_wrong_day",
        message: "RLD must be on Monday (or Tuesday if Monday is holiday)",
        severity: "warning"
      });
    }
  }
  
  // Rule 6: Missing data - ALWAYS enforced
  if (!closeDate || !rldDate) {
    violations.push({
      priority: 6,
      type: "missing_data",
      message: "Missing required dates",
      severity: "warning"
    });
  }
  
  violations.sort((a, b) => a.priority - b.priority);
  
  if (violations.length === 0) {
    return [{
      priority: 0,
      type: "compliant",
      message: isExpansionsPipeline ? "Expansions pipeline - flexible timing" : "All rules compliant",
      severity: "success"
    }];
  }
  
  return violations;
};

// Helper function to format dates nicely (avoiding timezone issues)
const formatDate = (dateString) => {
  if (!dateString) return "Not set";
  
  const date = parseDate(dateString);
  if (!date) return "Not set";
  
  return date.toLocaleDateString("en-US", { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    weekday: 'short',
    timeZone: 'America/New_York'
  });
};

// Helper function to format date for API (YYYY-MM-DD)
const formatDateForAPI = (date) => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get emoji for violation type
const getEmojiForViolation = (type) => {
  switch(type) {
    case "compliant": return "✅";
    case "close_date_past": return "🚨";
    case "rld_past": return "⏰";
    case "rld_before_close": return "🔄";
    case "rld_too_soon": return "⚡";
    case "rld_wrong_day": return "📅";
    case "rld_holiday": return "🎃";
    case "missing_data": return "❓";
    default: return "⚠️";
  }
};

// Helper function to get tag variant based on severity
const getTagVariant = (severity) => {
  switch(severity) {
    case "success": return "success";
    case "warning": return "warning";
    case "error": return "error";
    default: return "warning";
  }
};

// Define the Extension component
const Extension = ({ context, runServerless, sendAlert }) => {
  const [dealData, setDealData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [customRLD, setCustomRLD] = useState("");
  const [isValidatingCustom, setIsValidatingCustom] = useState(false);
  const [customValidationResult, setCustomValidationResult] = useState(null);
  const [canEditApproval, setCanEditApproval] = useState(false);
  const [isRequestingOverride, setIsRequestingOverride] = useState(false);
  const [userCanApprove, setUserCanApprove] = useState(false); // NEW: Track approval permission
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dealId = context.crm.objectId;

  // NEW: Check user permissions when component loads
  useEffect(() => {
    const hasApprovalPermission = checkApprovalPermission(context.user);
    setUserCanApprove(hasApprovalPermission);
  }, [context.user]);

  // Fetch deal properties when component loads
  useEffect(() => {
    const fetchDealData = async () => {
      try {
        setLoading(true);
        const { response } = await runServerless({ 
          name: "getDealProperties", 
          parameters: { 
            dealId: dealId,
            properties: [
              'seat_count___final', 
              'closedate', 
              'requested_launch_date', 
              'is_closed', 
              'dealname',
              'pipeline',
              // State management properties
              'compliance_status',
              'override_request_status', 
              'override_requested_by',
              'override_request_date',
              'override_approved_by',
              'override_approval_date',
              // NEW: Date tracking properties
              'approved_close_date',
              'approved_rld'
            ]
          } 
        });
        setDealData(response);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (dealId) {
      fetchDealData();
    }
  }, [dealId, runServerless]);

  // Check compliance and auto-update properties
  useEffect(() => {
    const updateComplianceAndApproval = async () => {
      if (!dealData) return;
      
      const violations = calculateAllCompliance(
        dealData.closedate, 
        dealData.requested_launch_date, 
        dealData.is_closed,
        dealData.pipeline
      );
      
      const isCompliant = violations.length === 1 && violations[0].type === "compliant";
      const primaryViolation = getPrimaryViolation(violations);
      
      console.log('=== COMPLIANCE UPDATE ===');
      console.log('Today is:', new Date().toISOString().split('T')[0]);
      console.log('Current compliance status:', dealData.compliance_status);
      console.log('Calculated primary violation:', primaryViolation);
      console.log('Is compliant:', isCompliant);
      console.log('Current override status:', dealData.override_request_status);
      console.log('Current approval date:', dealData.override_approval_date);
      console.log('Current approved by:', dealData.override_approved_by);
      console.log('Current RLD override approval (old):', dealData.rld_override_approval);
      
      // NEW: Check for date changes since approval
      console.log('--- DATE CHANGE DETECTION ---');
      console.log('Current close date:', dealData.closedate);
      console.log('Approved close date:', dealData.approved_close_date);
      console.log('Current RLD:', dealData.requested_launch_date);
      console.log('Approved RLD:', dealData.approved_rld);
      
      const hasApproval = dealData.override_request_status === "approved";
      const closeDateChanged = hasApproval && dealData.approved_close_date && 
                               dealData.closedate !== dealData.approved_close_date;
      const rldChanged = hasApproval && dealData.approved_rld && 
                         dealData.requested_launch_date !== dealData.approved_rld;
      const datesChangedSinceApproval = closeDateChanged || rldChanged;
      
      console.log('Has approval:', hasApproval);
      console.log('Close date changed:', closeDateChanged);
      console.log('RLD changed:', rldChanged);
      console.log('Dates changed since approval:', datesChangedSinceApproval);
      
      // Prepare property updates
      const propertiesToUpdate = {};
      
      // Always update compliance status if it changed
      if (dealData.compliance_status !== primaryViolation) {
        propertiesToUpdate.compliance_status = primaryViolation;
        console.log('📝 Compliance status changed from', dealData.compliance_status, 'to', primaryViolation);
      }
      
      // Handle approval logic based on compliance (ALWAYS run this check)
      console.log('🔍 Checking approval logic...');

      // PRIORITY 1: Check if dates changed since approval (STRICT MODE)
      if (datesChangedSinceApproval) {
        console.log('🚨 DATES CHANGED SINCE APPROVAL - Clearing approval');
        console.log('Close date:', dealData.approved_close_date, '→', dealData.closedate);
        console.log('RLD:', dealData.approved_rld, '→', dealData.requested_launch_date);
        
        // Clear approval because dates changed
        propertiesToUpdate.override_request_status = "none";
        propertiesToUpdate.override_approved_by = "";
        propertiesToUpdate.override_approval_date = "";
        propertiesToUpdate.override_requested_by = "";
        propertiesToUpdate.override_request_date = "";
        propertiesToUpdate.rld_override_approval = ""; // Clear old property too
        propertiesToUpdate.approved_close_date = ""; // Clear tracking dates
        propertiesToUpdate.approved_rld = "";
        
        const approvalType = dealData.override_approved_by === "Auto-approved (Compliant)" ? "auto-approval" : "manual override";
        console.log(`🔄 STRICT MODE: Clearing ${approvalType} due to date changes`);
        
      } else if (isCompliant) {
        console.log('✅ Deal is compliant - checking auto-approval...');
        // Deal is compliant - auto-approve if not already approved
        if (dealData.override_request_status !== "approved") {
          console.log('🔄 Auto-approving compliant deal');
          propertiesToUpdate.override_request_status = "approved";
          propertiesToUpdate.override_approved_by = "Auto-approved (Compliant)";
          propertiesToUpdate.override_approval_date = new Date().toISOString().split('T')[0];
          propertiesToUpdate.rld_override_approval = "Approved"; // Set old property for closing
          
          // NEW: Store the dates at time of approval
          propertiesToUpdate.approved_close_date = dealData.closedate;
          propertiesToUpdate.approved_rld = dealData.requested_launch_date;
          console.log('📝 Storing approval dates - Close:', dealData.closedate, 'RLD:', dealData.requested_launch_date);
        } else {
          console.log('ℹ️ Deal already approved');
        }
      } else {
        // Deal is not compliant - check if we need to clear existing approvals
        console.log('🚨 Deal is NOT compliant. Checking for existing approvals to clear...');
        console.log('override_request_status:', dealData.override_request_status);
        
        if (dealData.override_request_status === "approved") {
          // FIXED: Only clear if this is an old auto-approval that's no longer valid
          if (dealData.override_approved_by === "Auto-approved (Compliant)") {
            console.log('⚠️ Found old auto-approval on non-compliant deal - clearing');
            propertiesToUpdate.override_request_status = "none";
            propertiesToUpdate.override_approved_by = "";
            propertiesToUpdate.override_approval_date = "";
            propertiesToUpdate.override_requested_by = "";
            propertiesToUpdate.override_request_date = "";
            propertiesToUpdate.rld_override_approval = ""; // Clear old property too
            propertiesToUpdate.approved_close_date = ""; // Clear tracking dates
            propertiesToUpdate.approved_rld = "";
            
            console.log('🔄 BACKUP CLEAR: Removing old auto-approval from non-compliant deal');
          } else {
            console.log('✅ Found manual override approval - keeping it (this is what overrides are for!)');
            // Don't clear manual overrides - they're supposed to override compliance rules!
          }
        } else {
          console.log('ℹ️ No existing approval to clear');
        }
      }
        // Don't clear manual override approvals - let managers decide
      
      // Update properties if needed
      if (Object.keys(propertiesToUpdate).length > 0) {
        console.log('📝 Properties need updating:', propertiesToUpdate);
        console.log('Number of properties to update:', Object.keys(propertiesToUpdate).length);
        
        const updateResults = await updateDealProperties(runServerless, dealId, propertiesToUpdate);
        
        console.log('📋 Update results:', updateResults);
        
        // Update local state with successful updates
        const successfulUpdates = {};
        updateResults.forEach(result => {
          if (result.success) {
            successfulUpdates[result.property] = propertiesToUpdate[result.property];
            console.log(`✅ Successfully updated ${result.property} to: ${propertiesToUpdate[result.property]}`);
          } else {
            console.log(`❌ Failed to update ${result.property}:`, result.error);
          }
        });
        
        if (Object.keys(successfulUpdates).length > 0) {
          console.log('🔄 Updating local state with:', successfulUpdates);
          setDealData(prev => ({
            ...prev,
            ...successfulUpdates
          }));
        }
        
        // Check if we can edit properties (for permission detection)
        const hasEditPermission = updateResults.some(result => result.success);
        setCanEditApproval(hasEditPermission);
      } else {
        console.log('ℹ️ No property updates needed');
        // No updates needed, but still test edit permission
        try {
          await runServerless({
            name: "updateDealProperty",
            parameters: {
              dealId: dealId,
              property: "compliance_status",
              value: dealData.compliance_status || primaryViolation
            }
          });
          setCanEditApproval(true);
        } catch (err) {
          setCanEditApproval(false);
        }
      }
      
      console.log('=== END COMPLIANCE UPDATE ===');
    };

    updateComplianceAndApproval();
  }, [dealData?.closedate, dealData?.requested_launch_date, dealData?.is_closed, dealId, runServerless]);

  // Handle custom RLD with override
  const handleSetWithOverride = async () => {
    if (!customRLD) return;
    
    try {
      setIsValidatingCustom(true);
      const formattedDate = formatDateForAPI(parseDate(customRLD));
      
      console.log('=== SET WITH OVERRIDE DEBUG ===');
      console.log('Custom RLD input:', customRLD);
      console.log('Formatted date:', formattedDate);
      console.log('Deal ID:', dealId);
      
      // Step 1: Update the RLD first
      const result = await runServerless({
        name: "updateDealProperty",
        parameters: {
          dealId: dealId,
          property: "requested_launch_date",
          value: formattedDate
        }
      });

      const response = result.response || result;
      console.log('RLD update result:', response);
      
      if (response && response.success) {
        console.log('✅ RLD updated successfully');
        
        // Step 2: Set override properties
        const requestedBy = `${context.user.firstName} ${context.user.lastName} (${context.user.email})`;
        const requestDate = new Date().toISOString().split('T')[0];
        
        const overrideProperties = {
          override_request_status: "pending",
          override_requested_by: requestedBy,
          override_request_date: requestDate,
          override_approved_by: "",
          override_approval_date: "",
          rld_override_approval: "" // Clear old property to block closing
        };
        
        console.log('Setting override properties:', overrideProperties);
        const overrideResults = await updateDealProperties(runServerless, dealId, overrideProperties);
        const overrideSuccessful = overrideResults.every(result => result.success);
        
        if (overrideSuccessful) {
          console.log('✅ Override properties updated successfully');
          
          // Update local state
          setDealData(prev => ({
            ...prev,
            requested_launch_date: formattedDate,
            ...overrideProperties
          }));
          
          // Step 3: Send Slack notification
          const actualDealName = dealData.dealname || `${dealData.seat_count___final || 'Unknown'} Seat Deal`;
          
          // Calculate violations for the new date
          const newViolations = calculateAllCompliance(dealData.closedate, formattedDate, dealData.is_closed, dealData.pipeline);
          const violationMessages = newViolations
            .filter(v => v.type !== "compliant")
            .map(v => v.message);

          console.log('Sending Slack notification...');
          const slackResult = await runServerless({
            name: "slackOverrideNotification",
            parameters: {
              dealId: dealId,
              dealName: actualDealName,
              seatCount: dealData.seat_count___final,
              closeDate: dealData.closedate,
              currentRLD: formattedDate,
              suggestedRLD: formatDateForAPI(calculatePerfectRLD(dealData.closedate, formattedDate)),
              violations: violationMessages,
              repName: context.user.firstName + ' ' + context.user.lastName,
              repEmail: context.user.email,
              companyName: null
            }
          });

          const slackResponse = slackResult.response || slackResult;
          
          setCustomRLD("");
          
          if (slackResponse && slackResponse.success) {
            setCustomValidationResult({ 
              success: true, 
              message: `RLD set to ${formatDate(formattedDate)} - Slack notification sent to managers`,
              violations: []
            });
            
            sendAlert({ 
              message: `🆘 RLD set to ${formatDate(formattedDate)} - Override request sent to Slack!`, 
              variant: "warning" 
            });
          } else {
            setCustomValidationResult({ 
              success: true, 
              message: `RLD set to ${formatDate(formattedDate)} - Override requested (Slack notification failed)`,
              violations: []
            });
            
            sendAlert({ 
              message: `🆘 RLD set to ${formatDate(formattedDate)} - Override requested (Slack failed)`, 
              variant: "warning" 
            });
          }
        } else {
          console.log('❌ Override properties failed');
          const failures = overrideResults.filter(r => !r.success);
          sendAlert({ 
            message: `❌ Failed to set override properties: ${failures.map(f => f.error).join(', ')}`, 
            variant: "error" 
          });
        }
      } else {
        console.log('❌ RLD update failed:', response);
        sendAlert({ message: "❌ Failed to set RLD", variant: "error" });
      }
    } catch (err) {
      console.log('❌ Exception in handleSetWithOverride:', err);
      sendAlert({ message: `❌ Error setting RLD: ${err.message}`, variant: "error" });
    } finally {
      setIsValidatingCustom(false);
      console.log('=== END SET WITH OVERRIDE DEBUG ===');
    }
  };

  // Handle custom RLD validation and update
  const handleValidateCustomRLD = async () => {
    if (!customRLD) {
      setCustomValidationResult({ 
        success: false, 
        message: "Please enter a date first",
        violations: []
      });
      return;
    }

    const customDate = parseDate(customRLD);
    if (!customDate || isNaN(customDate.getTime())) {
      setCustomValidationResult({ 
        success: false, 
        message: "Invalid date format. Please use MM/DD/YYYY or select from calendar",
        violations: []
      });
      return;
    }

    const customViolations = calculateAllCompliance(dealData.closedate, customRLD, dealData.is_closed, dealData.pipeline);
    const hasViolations = customViolations.some(v => v.type !== "compliant");

    if (hasViolations) {
      setCustomValidationResult({ 
        success: false, 
        message: "Custom date has compliance violations:",
        violations: customViolations.filter(v => v.type !== "compliant"),
        allowOverride: true
      });
      return;
    }

    try {
      setIsValidatingCustom(true);
      setCustomValidationResult(null);
      const formattedDate = formatDateForAPI(customDate);
      
      const result = await runServerless({
        name: "updateDealProperty",
        parameters: {
          dealId: dealId,
          property: "requested_launch_date",
          value: formattedDate
        }
      });

      const response = result.response || result;
      
      if (response && response.success) {
        setDealData(prev => ({
          ...prev,
          requested_launch_date: formattedDate,
          override_request_status: null, // Clear override status for compliant date
          override_requested_by: "",
          override_request_date: "",
          rld_override_approval: "Approved", // Set old property for compliant date
          approved_close_date: dealData.closedate, // Store approval dates
          approved_rld: formattedDate
        }));
        
        setCustomRLD("");
        setCustomValidationResult({ 
          success: true, 
          message: `RLD updated to ${formatDate(formattedDate)} (Custom date approved!)`,
          violations: []
        });
        
        sendAlert({ 
          message: `✅ RLD updated to ${formatDate(formattedDate)} (Custom date approved!)`, 
          variant: "success" 
        });
      } else {
        const errorMsg = response?.error || "Unknown error occurred";
        setCustomValidationResult({ 
          success: false, 
          message: `Failed to update RLD: ${errorMsg}`,
          violations: []
        });
      }
    } catch (err) {
      setCustomValidationResult({ 
        success: false, 
        message: `Error updating RLD: ${err.message}`,
        violations: []
      });
    } finally {
      setIsValidatingCustom(false);
    }
  };

  // Handle suggested RLD fix button click
  const handleFixRLD = async () => {
    if (!dealData?.closedate) {
      sendAlert({ message: "❌ Cannot fix RLD: Close Date is required", variant: "error" });
      return;
    }

    const perfectRLD = calculatePerfectRLD(dealData.closedate, dealData.requested_launch_date);
    if (!perfectRLD) {
      sendAlert({ message: "❌ Could not calculate perfect RLD", variant: "error" });
      return;
    }

    try {
      setIsUpdating(true);
      const formattedDate = formatDateForAPI(perfectRLD);
      
      console.log('=== FIX RLD DEBUG ===');
      console.log('Perfect RLD calculated:', perfectRLD);
      console.log('Formatted date:', formattedDate);
      console.log('Is federal holiday?', isFederalHoliday(perfectRLD));
      console.log('Day of week:', perfectRLD.getDay()); // 0=Sunday, 1=Monday, 2=Tuesday
      
      const result = await runServerless({
        name: "updateDealProperty",
        parameters: {
          dealId: dealId,
          property: "requested_launch_date",
          value: formattedDate
        }
      });

      const response = result.response || result;
      
      if (response && response.success) {
        // Test compliance of the new date
        const testViolations = calculateAllCompliance(dealData.closedate, formattedDate, dealData.is_closed, dealData.pipeline);
        const isNewDateCompliant = testViolations.length === 1 && testViolations[0].type === "compliant";
        
        console.log('New date violations:', testViolations);
        console.log('Is new date compliant?', isNewDateCompliant);
        
        // Clear override properties if the new date is compliant
        const newOverrideStatus = isNewDateCompliant ? "approved" : null;
        const newApprovedBy = isNewDateCompliant ? "Auto-approved (Compliant)" : "";
        const newApprovalDate = isNewDateCompliant ? new Date().toISOString().split('T')[0] : "";
        const newRldApproval = isNewDateCompliant ? "Approved" : ""; // Set old property
        const newApprovedCloseDate = isNewDateCompliant ? dealData.closedate : ""; // Store approval dates
        const newApprovedRld = isNewDateCompliant ? formattedDate : "";
        
        setDealData(prev => ({
          ...prev,
          requested_launch_date: formattedDate,
          override_request_status: newOverrideStatus,
          override_approved_by: newApprovedBy,
          override_approval_date: newApprovalDate,
          override_requested_by: "",
          override_request_date: "",
          rld_override_approval: newRldApproval, // Update old property too
          approved_close_date: newApprovedCloseDate, // Update tracking dates
          approved_rld: newApprovedRld
        }));
        
        const successMessage = isNewDateCompliant 
          ? `✅ RLD updated to ${formatDate(formattedDate)} (Perfect and compliant!)` 
          : `✅ RLD updated to ${formatDate(formattedDate)} (Still needs approval)`;
          
        sendAlert({ 
          message: successMessage, 
          variant: isNewDateCompliant ? "success" : "warning"
        });
      } else {
        const errorMsg = response?.error || "Unknown error occurred";
        sendAlert({ message: `❌ Failed to update RLD: ${errorMsg}`, variant: "error" });
      }
    } catch (err) {
      sendAlert({ message: `❌ Error updating RLD: ${err.message}`, variant: "error" });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle override request with Slack notification
  const handleRequestOverride = async () => {
    try {
      setIsRequestingOverride(true);
      
      console.log('=== OVERRIDE REQUEST DEBUG ===');
      console.log('Deal ID:', dealId);
      
      const requestedBy = `${context.user.firstName} ${context.user.lastName} (${context.user.email})`;
      const requestDate = new Date().toISOString().split('T')[0];
      
      // STEP 1: Update override properties FIRST (before Slack)
      console.log('Step 1: Updating override properties...');
      const propertiesToUpdate = {
        override_request_status: "pending",
        override_requested_by: requestedBy,
        override_request_date: requestDate,
        override_approved_by: "", // Clear any previous approval
        override_approval_date: "",
        rld_override_approval: "" // Clear old property to block closing
      };
      
      const updateResults = await updateDealProperties(runServerless, dealId, propertiesToUpdate);
      const allSuccessful = updateResults.every(result => result.success);
      
      console.log('Step 1 results:', updateResults);
      
      if (!allSuccessful) {
        console.log('Step 1 FAILED: Could not update properties');
        const failures = updateResults.filter(r => !r.success);
        sendAlert({ 
          message: `❌ Failed to request override: ${failures.map(f => f.error).join(', ')}`, 
          variant: "error" 
        });
        return; // Don't send Slack if properties failed
      }
      
      console.log('Step 1 SUCCESS: Properties updated');
      
      // Update local state immediately
      setDealData(prev => ({
        ...prev,
        ...propertiesToUpdate
      }));
      
      // STEP 2: Now send Slack notification (properties are ready)
      console.log('Step 2: Sending Slack notification (properties are now set)...');
      
      // Get deal name from HubSpot
      const actualDealName = dealData.dealname || `${dealData.seat_count___final || 'Unknown'} Seat Deal`;
      
      // Get violation details for Slack message
      const violationMessages = violations
        .filter(v => v.type !== "compliant")
        .map(v => v.message);

      // Send rich Slack notification
      const slackResult = await runServerless({
        name: "slackOverrideNotification",
        parameters: {
          dealId: dealId,
          dealName: actualDealName,
          seatCount: dealData.seat_count___final,
          closeDate: dealData.closedate,
          currentRLD: dealData.requested_launch_date,
          suggestedRLD: formatDateForAPI(perfectRLD),
          violations: violationMessages,
          repName: context.user.firstName + ' ' + context.user.lastName,
          repEmail: context.user.email,
          companyName: null
        }
      });

      console.log('Step 2 result:', slackResult);
      const slackResponse = slackResult.response || slackResult;
      
      if (slackResponse && slackResponse.success) {
        console.log('Step 2 SUCCESS: Slack notification sent');
        sendAlert({ 
          message: "🆘 Override requested! Properties updated, Slack notification sent to managers.", 
          variant: "warning" 
        });
      } else {
        console.log('Step 2 PARTIAL: Properties updated but Slack failed');
        sendAlert({ 
          message: "🆘 Override requested! Properties updated (Slack notification failed, but override is pending)", 
          variant: "warning" 
        });
      }
    } catch (err) {
      console.log('EXCEPTION in handleRequestOverride:', err);
      sendAlert({ message: `❌ Error requesting override: ${err.message}`, variant: "error" });
    } finally {
      setIsRequestingOverride(false);
      console.log('=== END OVERRIDE REQUEST DEBUG ===');
    }
  };

  // Handle manager approval
  const handleApproveOverride = async () => {
    // Check permission before allowing approval
    if (!userCanApprove) {
      sendAlert({ 
        message: "❌ You don't have permission to approve overrides. Contact your manager.", 
        variant: "error" 
      });
      return;
    }

    try {
      setIsUpdating(true);
      
      const approvedBy = `${context.user.firstName} ${context.user.lastName} (${context.user.email})`;
      const approvalDate = new Date().toISOString().split('T')[0];
      
      const propertiesToUpdate = {
        override_request_status: "approved",
        override_approved_by: approvedBy,
        override_approval_date: approvalDate,
        rld_override_approval: "Approved with Override", // Set old property for closing
        // NEW: Store the dates at time of approval  
        approved_close_date: dealData.closedate,
        approved_rld: dealData.requested_launch_date
      };
      
      const updateResults = await updateDealProperties(runServerless, dealId, propertiesToUpdate);
      const allSuccessful = updateResults.every(result => result.success);
      
      if (allSuccessful) {
        setDealData(prev => ({
          ...prev,
          ...propertiesToUpdate
        }));
        
        sendAlert({ 
          message: "✅ Override approved! Deal can now be closed.", 
          variant: "success" 
        });
      } else {
        const failures = updateResults.filter(r => !r.success);
        sendAlert({ 
          message: `❌ Failed to approve override: ${failures.map(f => f.error).join(', ')}`, 
          variant: "error" 
        });
      }
    } catch (err) {
      sendAlert({ message: `❌ Error approving override: ${err.message}`, variant: "error" });
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Handle manual refresh of deal data
  const handleRefreshData = async () => {
  try {
    setIsRefreshing(true);
    
    const { response } = await runServerless({ 
      name: "getDealProperties", 
      parameters: { 
        dealId: dealId,
        properties: [
          'seat_count___final', 
          'closedate', 
          'requested_launch_date', 
          'is_closed', 
          'dealname',
          'compliance_status',
          'override_request_status', 
          'override_requested_by',
          'override_request_date',
          'override_approved_by',
          'override_approval_date',
          'approved_close_date',
          'approved_rld'
        ]
      } 
    });
    
    setDealData(response);
    sendAlert({ 
      message: "✅ Deal data refreshed!", 
      variant: "success" 
    });
  } catch (err) {
    sendAlert({ 
      message: `❌ Error refreshing data: ${err.message}`, 
      variant: "error" 
    });
  } finally {
    setIsRefreshing(false);
  }
};

  // Show loading spinner while data loads
  if (loading) {
    return (
      <Flex direction="column" gap="small" align="center">
        <LoadingSpinner />
        <Text>Loading...</Text>
      </Flex>
    );
  }

  // Show error if something went wrong
  if (error) {
    return (
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: "bold" }}>Error Loading Deal Data</Text>
        <Text>{error}</Text>
      </Flex>
    );
  }

  // Calculate all compliance violations
  const violations = dealData ? 
    calculateAllCompliance(dealData.closedate, dealData.requested_launch_date, dealData.is_closed, dealData.pipeline) :
    [{ type: "missing_data", message: "No data", severity: "warning" }];

  // Calculate perfect RLD for suggestion
  const perfectRLD = calculatePerfectRLD(dealData?.closedate, dealData?.requested_launch_date);
  const needsRLDFix = violations.some(v => 
    ['rld_before_close', 'rld_too_soon', 'rld_wrong_day', 'rld_holiday', 'rld_past'].includes(v.type)
  );

  const isCompliant = violations.length === 1 && violations[0].type === "compliant";
  const overrideStatus = dealData?.override_request_status;
  const hasApproval = overrideStatus === "approved";
  const isPendingApproval = overrideStatus === "pending";
  
  // Use old property for final closing decision
  const canClose = dealData?.rld_override_approval === "Approved" || 
                   dealData?.rld_override_approval === "Approved with Override";
  const blocksDealsHere = !canClose;

    // Replace your main return statement with this more compact version:

    return (
      <Flex direction="column" gap="small">
      {/* Simple one-property-per-row layout */}
      <Flex direction="column" gap="extraSmall">
        <Flex direction="row" justify="between" align="center">
          <Text format={{ fontWeight: "demibold", fontSize: "small" }}>Seat Count:</Text>
          <Text format={{ fontSize: "small" }}>{dealData?.seat_count___final || "Not set"}</Text>
        </Flex>
        
        <Flex direction="row" justify="between" align="center">
          <Text format={{ fontWeight: "demibold", fontSize: "small" }}>Close Date:</Text>
          <Text format={{ fontSize: "small" }}>{formatDate(dealData?.closedate)}</Text>
        </Flex>

      {/* Refresh Button */}
      <Flex direction="row" justify="start" gap="small">
        <Button 
          onClick={handleRefreshData}
          disabled={isRefreshing}
          variant="secondary"
          size="small"
        >
          {isRefreshing ? "🔄 Refreshing..." : "🔄 Refresh Data"}
        </Button>
        <Text variant="microcopy" format={{ fontSize: "extraSmall" }}>
          💡 Click after updating close date or seat count on the record
        </Text>
      </Flex>
        
        <Flex direction="row" justify="between" align="center">
          <Text format={{ fontWeight: "demibold", fontSize: "small" }}>Requested Launch:</Text>
          <Text format={{ fontSize: "small" }}>{formatDate(dealData?.requested_launch_date)}</Text>
        </Flex>
      </Flex>

      {/* Suggested RLD and Custom RLD on same line */}
      <Flex direction="column" gap="extraSmall">
        {/* Suggested RLD and Custom input on same row */}
        <Flex direction="row" gap="small" align="center">
          {/* Suggested RLD - Left side */}
          {perfectRLD && (
            <Flex direction="column" gap="extraSmall" style={{ flex: "1" }}>
              <Flex direction="row" justify="between" align="center">
                <Text format={{ fontWeight: "demibold", fontSize: "small" }}>💡 Suggested:</Text>
                <Text format={{ fontSize: "small" }}>{formatDate(formatDateForAPI(perfectRLD))}</Text>
              </Flex>
              {needsRLDFix && (
                <Button 
                  onClick={handleFixRLD} 
                  disabled={isUpdating}
                  variant="secondary"
                  size="medium"
                  style={{ height: "32px" }}
                >
                  {isUpdating ? "🔄" : "🔧 Use Suggested"}
                </Button>
              )}
            </Flex>
          )}
          
          {/* Custom RLD Input - Right side */}
          <Flex direction="column" gap="extraSmall" style={{ flex: "1" }}>
            <Text format={{ fontWeight: "demibold", fontSize: "small" }}>🛠️ Set Custom:</Text>
            <Flex direction="row" gap="extraSmall" align="center">
              <Input
                name="customRLD"
                label=""
                placeholder="MM/DD/YYYY"
                value={customRLD}
                onInput={setCustomRLD}
                type="date"
                size="small"
              />
              <Button 
                onClick={handleValidateCustomRLD}
                disabled={isValidatingCustom || !customRLD}
                variant="primary"
                size="medium"
                style={{ height: "32px" }}
              >
                {isValidatingCustom ? "🔄" : "✅ Set"}
              </Button>
            </Flex>
          </Flex>
        </Flex>
        
        {/* Validation Results - More compact */}
        {customValidationResult && (
          <Flex direction="column" gap="extraSmall">
            <Tag variant={customValidationResult.success ? "success" : "error"} size="small">
              {customValidationResult.success ? "✅" : "❌"} {customValidationResult.message}
            </Tag>
            
            {/* Show violations as smaller tags */}
            {customValidationResult.violations?.map((violation, index) => (
              <Tag key={index} variant="warning" size="extraSmall">
                {getEmojiForViolation(violation.type)} {violation.message}
              </Tag>
            ))}
            
            {/* Override option - more compact */}
            {customValidationResult.allowOverride && (
              <Button 
                onClick={handleSetWithOverride}
                disabled={isValidatingCustom}
                variant="warning"
                size="small"
              >
                {isValidatingCustom ? "🔄" : "🆘 Set & Request Override"}
              </Button>
            )}
          </Flex>
        )}
        
        <Text variant="microcopy" format={{ fontSize: "extraSmall" }}>
          💡 Use calendar picker or type date format
        </Text>
      </Flex>
      
      {/* Compliance Status - Horizontal layout for tags */}
      <Flex direction="column" gap="extraSmall">
        <Text format={{ fontWeight: "demibold", fontSize: "small" }}>🚨 Status:</Text>
        <Flex direction="row" gap="extraSmall" wrap="wrap">
          {violations.map((violation, index) => (
            <Tag key={index} variant={getTagVariant(violation.severity)} size="small">
              {getEmojiForViolation(violation.type)} {violation.message}
            </Tag>
          ))}
        </Flex>
      </Flex>

      {/* Override Approval - More compact */}
      <Flex direction="column" gap="extraSmall" 
            style={{ 
              padding: "8px", 
              backgroundColor: hasApproval ? "#f0f9f0" : "#fff8e1",
              borderRadius: "4px",
              borderLeft: hasApproval ? "3px solid #00875a" : "3px solid #f57c00"
            }}>
        
        <Flex direction="row" justify="between" align="center">
          <Text format={{ fontWeight: "demibold", fontSize: "small" }}>🔒 Override:</Text>
          {overrideStatus === "approved" ? (
            <Tag variant="success" size="small">✅ Approved</Tag>
          ) : isPendingApproval ? (
            <Tag variant="warning" size="small">⏳ Pending</Tag>
          ) : overrideStatus === "denied" ? (
            <Tag variant="error" size="small">❌ Denied</Tag>
          ) : isCompliant ? (
            <Tag variant="success" size="small">✅ Auto-Approved</Tag>
          ) : (
            <Tag variant="error" size="small">🚫 Required</Tag>
          )}
        </Flex>

        {/* Approval Details - Compact */}
        {(hasApproval || isPendingApproval) && (
          <Text variant="microcopy" format={{ fontSize: "extraSmall" }}>
            {hasApproval ? 
              `Approved by: ${dealData?.override_approved_by?.split(' (')[0]} on ${formatDate(dealData.override_approval_date)}` :
              `Requested by: ${dealData?.override_requested_by?.split(' (')[0]} on ${formatDate(dealData.override_request_date)}`
            }
          </Text>
        )}

        {/* Action Buttons - Smaller */}
        {!isCompliant && overrideStatus !== "pending" && !hasApproval && (
          <Button 
            onClick={handleRequestOverride}
            disabled={isRequestingOverride}
            variant="warning"
            size="small"
          >
            {isRequestingOverride ? "🔄" : "🆘 Request Override"}
          </Button>
        )}

        {canEditApproval && isPendingApproval && userCanApprove && (
          <Button 
            onClick={handleApproveOverride}
            disabled={isUpdating}
            variant="primary"
            size="small"
          >
            {isUpdating ? "🔄" : "✅ Approve"}
          </Button>
        )}
        
        {canEditApproval && isPendingApproval && !userCanApprove && (
          <Text variant="microcopy" format={{ fontSize: "extraSmall" }}>
            💼 Contact your manager for approval
          </Text>
        )}
      </Flex>
    </Flex>
  );
};