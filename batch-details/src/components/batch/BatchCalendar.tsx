import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { EventContentArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Box, Flex, Text, Badge, HStack } from '@chakra-ui/react'
import type { Session } from '../../types'

interface Props {
  sessions: Session[]
}

function buildEvents(sessions: Session[]) {
  return sessions
    .filter(s => s.date)
    .map(s => {
      const start = s.start_time ? `${s.date}T${s.start_time}` : s.date!
      const end = s.end_time ? `${s.date}T${s.end_time}` : undefined

      return {
        id: s.id,
        title: s.session_title || 'Untitled Session',
        start,
        end,
        backgroundColor: s.is_end_of_schedule ? '#e53e3e' : '#3182ce',
        borderColor: s.is_end_of_schedule ? '#c53030' : '#2b6cb0',
        textColor: '#ffffff',
        extendedProps: { session: s },
      }
    })
}

function EventContent({ eventInfo }: { eventInfo: EventContentArg }) {
  const session = eventInfo.event.extendedProps.session as Session
  const isEnd = session.is_end_of_schedule

  return (
    <Box px={1} py={0.5} overflow="hidden" width="100%">
      <Text fontSize="11px" fontWeight="600" noOfLines={1} color="white">
        {isEnd && '🏁 '}
        {eventInfo.event.title}
      </Text>
      {session.instructor_name && (
        <Text fontSize="10px" color="whiteAlpha.900" noOfLines={1}>
          {session.instructor_name}
        </Text>
      )}
    </Box>
  )
}

export default function BatchCalendar({ sessions }: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const events = buildEvents(sessions)

  const hasEndOfSchedule = sessions.some(s => s.is_end_of_schedule === true)
  const endSession = sessions.find(s => s.is_end_of_schedule === true)
  const sessionsWithDate = sessions.filter(s => s.date).length
  const totalSessions = sessions.length

  return (
    <Box>
      {/* Schedule status banner */}
      <Flex mb={4} gap={3} align="center" flexWrap="wrap">
        {!hasEndOfSchedule && totalSessions > 0 && (
          <Box className="fc-incomplete-banner">
            ⚠ Incomplete Schedule — no session is marked as "End of Schedule"
          </Box>
        )}
        {hasEndOfSchedule && endSession?.date && (
          <HStack spacing={2} bg="green.50" px={3} py={1.5} borderRadius="md" border="1px" borderColor="green.200">
            <Text fontSize="sm" color="green.700" fontWeight="500">
              🏁 Schedule ends on {endSession.date}
            </Text>
          </HStack>
        )}
        <HStack spacing={3} ml="auto">
          <HStack spacing={1}>
            <Box w={3} h={3} bg="blue.500" borderRadius="sm" />
            <Text fontSize="xs" color="gray.600">Session</Text>
          </HStack>
          <HStack spacing={1}>
            <Box w={3} h={3} bg="red.500" borderRadius="sm" />
            <Text fontSize="xs" color="gray.600">End of Schedule</Text>
          </HStack>
          <Badge colorScheme="gray" fontSize="xs">
            {sessionsWithDate}/{totalSessions} sessions with dates
          </Badge>
        </HStack>
      </Flex>

      <Box
        border="1px"
        borderColor="gray.200"
        borderRadius="md"
        overflow="hidden"
        bg="white"
        p={3}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          timeZone="Asia/Kolkata"
          events={events}
          eventContent={eventInfo => <EventContent eventInfo={eventInfo} />}
          height="680px"
          dayMaxEvents={3}
          eventClassNames={arg => {
            if (arg.event.extendedProps.session?.is_end_of_schedule) return ['fc-end-of-schedule']
            return []
          }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
        />
      </Box>
    </Box>
  )
}
