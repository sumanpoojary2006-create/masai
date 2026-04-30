import { Box } from '@chakra-ui/react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function AppLayout() {
  return (
    <Box minH="100vh" bg="gray.50">
      <Navbar />
      <Box as="main" maxW="1600px" mx="auto" px={6} py={6}>
        <Outlet />
      </Box>
    </Box>
  )
}
