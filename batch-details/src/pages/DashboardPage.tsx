import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Spinner,
  Text,
  useToast,
} from '@chakra-ui/react'
import { AddIcon, SearchIcon } from '@chakra-ui/icons'
import { useAuth } from '../context/AuthContext'
import { useBatches } from '../hooks/useBatch'
import { supabase } from '../lib/supabase'
import BatchListGrid from '../components/dashboard/BatchListGrid'

export default function DashboardPage() {
  const { canEdit } = useAuth()
  const { batches, loading, refetch } = useBatches()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const filtered = batches.filter(b => {
    const q = search.toLowerCase()
    return (
      !q ||
      b.batch_name?.toLowerCase().includes(q) ||
      b.program_name?.toLowerCase().includes(q) ||
      b.institute_name?.toLowerCase().includes(q) ||
      b.domain?.toLowerCase().includes(q)
    )
  })

  async function handleCreateBatch() {
    setCreating(true)
    const { data, error } = await supabase
      .from('batches')
      .insert({})
      .select()
      .single()
    setCreating(false)

    if (error) {
      toast({ title: 'Failed to create batch', description: error.message, status: 'error', duration: 3000 })
      return
    }
    await refetch()
    navigate(`/batch/${data.id}`)
  }

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={6}>
        <Box>
          <Heading size="md" color="gray.800">Batches</Heading>
          <Text fontSize="sm" color="gray.500" mt={0.5}>
            {batches.length} batch{batches.length !== 1 ? 'es' : ''} total
          </Text>
        </Box>
        {canEdit && (
          <Button
            leftIcon={<AddIcon />}
            colorScheme="blue"
            onClick={handleCreateBatch}
            isLoading={creating}
            loadingText="Creating…"
          >
            New Batch
          </Button>
        )}
      </Flex>

      <HStack mb={4}>
        <InputGroup maxW="360px">
          <InputLeftElement pointerEvents="none">
            <SearchIcon color="gray.400" />
          </InputLeftElement>
          <Input
            placeholder="Search by batch name, program, domain…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            bg="white"
            size="sm"
            borderRadius="md"
          />
        </InputGroup>
      </HStack>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner size="lg" color="blue.500" />
        </Flex>
      ) : (
        <Box className="ag-theme-quartz" height="600px" border="1px" borderColor="gray.200" borderRadius="md" overflow="hidden" bg="white">
          <BatchListGrid batches={filtered} />
        </Box>
      )}
    </Box>
  )
}
