const { ChatSession, ChatMessage, Customer } = require('../models');
const { successResponse } = require('../utils/responseFormatter');
const ApiError = require('../utils/ApiError');

/**
 * Computes human-readable relative elapsed time label.
 *
 * @param {Date|string} date
 * @returns {string}
 */
function getRelativeTimeLabel(date) {
  if (!date) return 'Just now';
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

/**
 * Retrieves all live customer support sessions formatted for the Admin Support Console.
 * Route: GET /admin/support/sessions
 */
const getSupportSessions = async (req, res, next) => {
  try {
    const rawSessions = await ChatSession.findAll({
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'email', 'loyaltyTier'],
        },
        {
          model: ChatMessage,
          as: 'messages',
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    const sessions = rawSessions.map((session) => {
      const { customer } = session;
      const sortedMessages = (session.messages || []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const firstCustomerMsg = sortedMessages.find((m) => m.senderType === 'customer');
      const topicSnippet = firstCustomerMsg?.message
        ? firstCustomerMsg.message.slice(0, 40)
        : 'Customer Storefront Inquiry';

      let status = 'pending';
      if (session.status === 'closed' || session.status === 'resolved') {
        status = 'resolved';
      } else if (session.agentId || session.status === 'active') {
        status = 'agent_active';
      }

      const tierRaw = customer?.loyaltyTier || 'silver';
      const tierFormatted = tierRaw.charAt(0).toUpperCase() + tierRaw.slice(1);

      return {
        id: session.id.toString(),
        customer_id: session.customerId ? session.customerId.toString() : 'guest',
        customer_name:
          customer?.name ||
          (session.customerId ? `Customer #${session.customerId}` : 'Storefront Guest'),
        customer_email: customer?.email || 'guest@stackstorm.lk',
        tier: tierFormatted,
        status,
        inquiry_topic: topicSnippet,
        created_at: session.createdAt ? session.createdAt.toISOString() : new Date().toISOString(),
        wait_time_label: getRelativeTimeLabel(session.createdAt),
        messages: sortedMessages.map((m) => ({
          id: `msg-${m.id}`,
          sender: m.senderType === 'customer' ? 'customer' : 'agent',
          sender_name: m.senderType === 'customer' ? customer?.name || 'Customer' : 'Support Agent',
          text: m.message,
          timestamp: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
        })),
      };
    });

    return successResponse(res, { sessions }, 'Support sessions retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Updates the status of a support chat session (e.g. resolve or close).
 * Route: PATCH /admin/support/sessions/:id/status
 */
const updateSessionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const session = await ChatSession.findByPk(id);
    if (!session) {
      throw ApiError.notFound('Support session not found');
    }

    if (status === 'resolved' || status === 'closed') {
      session.status = 'closed';
    } else if (status === 'agent_active' || status === 'active') {
      session.status = 'open';
      if (req.user?.id) session.agentId = req.user.id;
    } else if (status === 'pending' || status === 'waiting') {
      session.status = 'waiting';
    }

    await session.save();
    return successResponse(res, { session }, 'Session status updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getSupportSessions,
  updateSessionStatus,
};
