import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useToast,
  VStack,
  Badge,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  useDisclosure,
} from '@chakra-ui/react'
import { ArrowBackIcon, DeleteIcon } from '@chakra-ui/icons'
import { useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBatch } from '../hooks/useBatch'
import { useSessions } from '../hooks/useSessions'
import BatchInfoGrid from '../components/batch/BatchInfoGrid'
import TeamMembersGrid from '../components/batch/TeamMembersGrid'
import GradingPolicyGrid from '../components/batch/GradingPolicyGrid'
import SessionsGrid from '../components/batch/SessionsGrid'
import BatchCalendar from '../components/batch/BatchCalendar'
import { supabase } from '../lib/supabase'
import { STATUS_COLOR } from '../constants/options'

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { canEdit, isAdmin } = useAuth()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement>(null)

  const { batch, loading, updateBatch } = useBatch(id!)
  const { sessions, addSession, updateSession, deleteSession } = useSessions(id!)

  async function handleDeleteBatch() {
    const { error } = await supabase.from('batches').delete().eq('id', id!)
    if (error) {
      toast({ title: 'Delete failed', description: error.message, status: 'error', duration: 3000 })
    } else {
      toast({ title: 'Batch deleted', status: 'success', duration: 2000 })
      navigate('/dashboard')
    }
  }

  if (loading) {
    return (
      <Flex justify="center" py={16}>
        <Spinner size="xl" color="blue.500" />
      </Flex>
    )
  }

  if (!batch) {
    return (
      <VStack py={16} spacing={4}>
        <Text color="gray.500">Batch not found.</Text>
        <Button leftIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </VStack>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Flex align="flex-start" justify="space-between" mb={6}>
        <HStack spacing={4} align="flex-start">
          <Button
            leftIcon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            color="gray.500"
          >
            Batches
          </Button>
          <Box>
            <Heading size="md" color="gray.800">
              {batch.batch_name || <Text as="span" color="gray.400" fontStyle="italic">Untitled Batch</Text>}
            </Heading>
            <HStack mt={1} spacing={2} flexWrap="wrap">
              {batch.program_name && (
                <Text fontSize="sm" color="gray.600">{batch.program_name}</Text>
              )}
              {batch.institute_name && (
                <Text fontSize="sm" color="gray.400">· {batch.institute_name}</Text>
              )}
              {batch.status && (
                <Badge colorScheme={STATUS_COLOR[batch.status] ?? 'gray'} fontSize="xs">
                  {batch.status}
                </Badge>
              )}
            </HStack>
          </Box>
        </HStack>

        {isAdmin && (
          <Button
            leftIcon={<DeleteIcon />}
            colorScheme="red"
            variant="outline"
            size="sm"
            onClick={onOpen}
          >
            Delete Batch
          </Button>
        )}
      </Flex>

      {/* Tabs */}
      <Tabs colorScheme="blue" variant="enclosed-colored" size="sm">
        <TabList>
          <Tab>Overview</Tab>
          <Tab>Sessions</Tab>
          <Tab>Calendar</Tab>
        </TabList>

        <TabPanels>
          {/* Overview tab */}
          <TabPanel px={0} pt={5}>
            <VStack spacing={8} align="stretch">
              <BatchInfoGrid
                batch={batch}
                canEdit={canEdit}
                onUpdate={updateBatch}
              />
              <TeamMembersGrid
                batch={batch}
                canEdit={canEdit}
                onUpdate={updateBatch}
              />
              <GradingPolicyGrid
                batch={batch}
                canEdit={canEdit}
                onUpdate={updateBatch}
              />
            </VStack>
          </TabPanel>

          {/* Sessions tab */}
          <TabPanel px={0} pt={5}>
            <SessionsGrid
              sessions={sessions}
              canEdit={canEdit}
              isAdmin={isAdmin}
              onAdd={addSession}
              onUpdate={updateSession}
              onDelete={deleteSession}
            />
          </TabPanel>

          {/* Calendar tab */}
          <TabPanel px={0} pt={5}>
            <BatchCalendar sessions={sessions} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Delete confirmation dialog */}
      <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete Batch
            </AlertDialogHeader>
            <AlertDialogBody>
              Are you sure you want to delete{' '}
              <strong>{batch.batch_name || 'this batch'}</strong>? All sessions will also be deleted. This cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose}>Cancel</Button>
              <Button colorScheme="red" onClick={handleDeleteBatch} ml={3}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
