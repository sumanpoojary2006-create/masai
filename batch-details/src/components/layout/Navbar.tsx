import {
  Flex,
  Text,
  Button,
  Badge,
  HStack,
  useToast,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const ROLE_COLOR: Record<string, string> = {
  admin: 'red',
  editor: 'blue',
  viewer: 'gray',
}

export default function Navbar() {
  const { user, role, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  async function handleSignOut() {
    await signOut()
    toast({ title: 'Signed out', status: 'info', duration: 2000, isClosable: true })
    navigate('/login')
  }

  return (
    <Flex
      as="nav"
      align="center"
      justify="space-between"
      px={6}
      py={3}
      bg="white"
      borderBottom="1px"
      borderColor="gray.200"
      position="sticky"
      top={0}
      zIndex={10}
      boxShadow="sm"
    >
      <HStack spacing={3} cursor="pointer" onClick={() => navigate('/dashboard')}>
        <Text fontSize="lg" fontWeight="700" color="blue.700" letterSpacing="-0.5px">
          Batch Wise
        </Text>
        <Text fontSize="xs" color="gray.400" fontWeight="500">
          by Masai
        </Text>
      </HStack>

      <HStack spacing={4}>
        {user && (
          <HStack spacing={2}>
            <Text fontSize="sm" color="gray.600">
              {user.email}
            </Text>
            {role && (
              <Badge colorScheme={ROLE_COLOR[role]} fontSize="xs" textTransform="lowercase">
                {role}
              </Badge>
            )}
          </HStack>
        )}
        <Button size="sm" variant="outline" colorScheme="gray" onClick={handleSignOut}>
          Sign out
        </Button>
      </HStack>
    </Flex>
  )
}
