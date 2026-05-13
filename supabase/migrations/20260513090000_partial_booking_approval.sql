alter type booking_status add value if not exists 'partially_approved';
alter type booking_status add value if not exists 'partially_rejected';
alter type booking_status add value if not exists 'cancelled';
