export const LAB_BOOKING_BLOCKING_STATUSES = ['pending', 'approved'];

export function roomBookingMutexId(bookingDate, labRoom) {
  return `${bookingDate}_${encodeURIComponent(String(labRoom || '').trim().toLowerCase())}`;
}

/** Fields safe to expose to signed-in users for the shared room calendar. */
export function labBookingCalendarEntry(booking) {
  return {
    bookingDate: booking.bookingDate,
    labRoom: booking.labRoom,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
  };
}
